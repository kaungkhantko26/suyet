import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const read = (p: string) => readFileSync(p, "utf8");
type Svc = Record<string, unknown> & { ports?: string[]; volumes?: string[]; image?: string; environment?: Record<string, string>; networks?: string[]; cap_drop?: string[]; security_opt?: string[]; read_only?: boolean; build?: unknown };
const compose = parse(read("docker-compose.yml"), { merge: true }) as { services: Record<string, Svc>; networks: Record<string, { internal?: boolean } | null> };
const svc = compose.services;

describe("docker-compose hardening (static analysis; the stack itself is validated on the VPS)", () => {
  it("only nginx publishes ports: PostgreSQL, Redis, web, worker and migrate are unreachable from outside", () => {
    for (const [name, s] of Object.entries(svc)) {
      if (name === "nginx") expect(s.ports).toEqual(["80:8080", "443:8443"]);
      else expect(s.ports, name).toBeUndefined();
    }
  });
  it("data services live only on an internal network with no route out", () => {
    expect(compose.networks.backend?.internal).toBe(true);
    expect(svc.db.networks).toEqual(["backend"]);
    expect(svc.redis.networks).toEqual(["backend"]);
    expect(svc.migrate.networks).toEqual(["backend"]);
    expect(svc.nginx.networks).toEqual(["edge"]); // the proxy cannot reach the database
  });
  it("every service drops all capabilities and blocks privilege escalation", () => {
    for (const [name, s] of Object.entries(svc)) {
      expect(s.cap_drop, name).toEqual(["ALL"]);
      expect(s.security_opt, name).toContain("no-new-privileges:true");
    }
  });
  it("application containers have read-only root filesystems and resource limits", () => {
    for (const n of ["web", "worker", "migrate", "nginx", "redis"]) expect(svc[n].read_only, n).toBe(true);
    for (const n of ["db", "web", "worker", "nginx"]) expect(svc[n].mem_limit, n).toBeTruthy();
  });
  it("the Docker socket is never mounted and no host paths beyond config/certs are exposed", () => {
    const vols = Object.values(svc).flatMap((s) => s.volumes ?? []);
    expect(vols.some((v) => v.includes("docker.sock"))).toBe(false);
    expect(vols.filter((v) => v.startsWith("/") ).every((v) => v.startsWith("/etc/letsencrypt"))).toBe(true);
  });
  it("images are pinned to explicit versions (never :latest)", () => {
    for (const [n, s] of Object.entries(svc)) if (s.image) { expect(s.image, n).toMatch(/:\d+\.\d+/); expect(s.image).not.toMatch(/latest/); }
    expect(read("Dockerfile")).toMatch(/ARG NODE_IMAGE=node:\d+\.\d+\.\d+-/);
  });
  it("database identities are separated: app = runtime role, migrate = schema owner, superuser never used by the app", () => {
    expect(svc.web.environment!.DATABASE_URL).toContain("letstech_app");
    expect(svc.worker.environment!.DATABASE_URL).toContain("letstech_app");
    expect(svc.migrate.environment!.DATABASE_URL).toContain("letstech_migrator");
    for (const n of ["web", "worker", "migrate"]) {
      expect(svc[n].environment!.DATABASE_URL, n).not.toMatch(/\/\/postgres:/);
      expect(svc[n].environment!.DATABASE_URL, n).not.toContain("POSTGRES_ADMIN_PASSWORD");
    }
    expect(svc.migrate.command).toContain("db-roles.ts grants");
  });
  it("no secret values are committed: every credential is an interpolated variable", () => {
    const text = read("docker-compose.yml");
    for (const line of text.split("\n").filter((l) => /(PASSWORD|SECRET|KEY|TOKEN)\s*:/.test(l) && !l.trim().startsWith("#"))) expect(line, line).toMatch(/\$\{|:\s*$/);
  });
  it("the app is configured for strict production security by default", () => {
    const env = svc.web.environment!;
    expect(env.CSP_MODE).toContain("enforce");
    expect(env.INTERNAL_AUTH_MODE).toContain("hmac");
    expect(env.HIBP_ENABLED).toContain("1");
  });
});

describe("Dockerfile hardening", () => {
  const d = read("Dockerfile");
  it("runs as a non-root user in every runtime stage and installs without lifecycle scripts", () => {
    expect(d).toMatch(/FROM \$\{NODE_IMAGE\} AS web[\s\S]*USER node/);
    expect(d).toMatch(/AS tools[\s\S]*USER node/);
    expect(d).toContain("npm ci --ignore-scripts");
    expect(d).not.toMatch(/curl|wget/); // no extra network tools in the runtime image
    expect(d).not.toMatch(/ENV[^\n]*(SECRET|PASSWORD|TOKEN)/i);
  });
  it("copies code root-owned (not writable by the app user)", () => { expect(d).toContain("--chown=root:root"); });
});

describe("nginx / TLS", () => {
  const n = read("nginx/events.conf.template");
  it("allows only TLS 1.2+ with forward-secret AEAD ciphers and OCSP stapling", () => {
    expect(n).toMatch(/ssl_protocols TLSv1\.2 TLSv1\.3;/);
    expect(n).not.toMatch(/TLSv1\.0|TLSv1\.1|SSLv/);
    expect(n).toMatch(/ssl_ciphers [^;]*GCM[^;]*CHACHA20/);
    expect(n).not.toMatch(/\bRC4\b|\b3DES\b|\bMD5\b|NULL|aNULL/);
    expect(n).toContain("ssl_stapling on");
    expect(n).toContain("ssl_session_tickets off");
  });
  it("redirects HTTP to HTTPS and sends HSTS", () => {
    expect(n).toMatch(/return 301 https:\/\/\$host\$request_uri/);
    expect(n).toContain("Strict-Transport-Security");
  });
  it("hides the version, limits bodies/timeouts/connections, and rejects unknown hosts", () => {
    expect(n).toContain("server_tokens off");
    expect(n).toMatch(/client_max_body_size 6m/);
    expect(n).toMatch(/client_(header|body)_timeout/);
    expect(n).toContain("limit_conn perip");
    expect(n).toMatch(/default_server; return 444/);
    expect(n).toContain("ssl_reject_handshake on");
  });
  it("sets (never appends) the client address/request id and strips a forged nonce, so clients cannot spoof them", () => {
    expect(n).toContain("X-Forwarded-For   $remote_addr");
    expect(n).not.toContain("$proxy_add_x_forwarded_for");
    expect(n).toContain("X-Real-IP         $remote_addr");
    expect(n).toContain("X-Request-Id      $request_id");
    expect(n).toContain('X-Nonce           ""');
  });
  it("rate-limits authentication and machine endpoints", () => {
    expect(n).toMatch(/location \/api\/internal\/[^}]*limit_req/);
    expect(n).toMatch(/location \/auth\/[^}]*limit_req/);
  });
});

describe("application security configuration", () => {
  it("the Next.js config sets baseline headers and HSTS only for HTTPS deployments", () => {
    const c = read("next.config.ts");
    for (const h of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]) expect(c).toContain(h);
    expect(c).toMatch(/startsWith\("https:"\)[^\n]*Strict-Transport-Security/);
    expect(c).toContain("allowedOrigins"); // server actions only accept the configured origin (CSRF)
    expect(c).toContain("poweredByHeader: false");
  });
  it("no wildcard CORS anywhere in source", () => {
    const src = ["next.config.ts", "src/proxy.ts"].map(read).join("\n");
    expect(src).not.toMatch(/Access-Control-Allow-Origin/i);
  });
  it("secrets are not committed: .env is ignored and .env.example holds placeholders only", () => {
    expect(read(".gitignore")).toMatch(/^\.env$/m);
    const ex = read(".env.example");
    for (const line of ex.split("\n").filter((l) => /^(SESSION_SECRET|INTERNAL_API_SECRET|CRON_SECRET|MFA_ENCRYPTION_KEY|ADMIN_PASSWORD|SMTP_PASS|S3_SECRET_KEY|[A-Z_]*PASSWORD)=/.test(l))) expect(line.split("=")[1].split("#")[0].trim(), line).toMatch(/^$|^change-me/);
  });
  it("CI pipeline runs the required checks and gives untrusted PRs no secrets", () => {
    const ci = read(".github/workflows/ci.yml");
    for (const needle of ["npm run typecheck", "npm run lint", "npm test", "npm run build", "audit-ci", "gitleaks", "semgrep", "trivy", "ignore-scripts"]) expect(ci.toLowerCase()).toContain(needle.toLowerCase());
    expect(ci).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(ci).not.toContain("pull_request_target"); // never run untrusted PR code with secrets
    expect(read(".github/workflows/deploy.yml")).toContain("environment: production");
    expect(read(".github/dependabot.yml")).toContain("npm");
    expect(read(".github/CODEOWNERS")).toContain("/src/lib/auth/");
  });
  it("backups are encrypted by construction (refuse to run without a recipient)", () => {
    const b = read("scripts/backup.sh");
    expect(b).toContain(": \"${BACKUP_AGE_RECIPIENT:?");
    expect(b).toMatch(/pg_dump[^\n]*\| age -r/);
    expect(b).toContain("umask 077");
    expect(b).not.toMatch(/> "\$OUT\/db-.*\.dump"/); // no plaintext dump file
  });
});
