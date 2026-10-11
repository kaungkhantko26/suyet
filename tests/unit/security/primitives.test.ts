import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, generateRecoveryCodes, hashRecoveryCode, hotp, verifyTotp } from "@/lib/security/totp";
import { buildCsp } from "@/lib/security/csp";
import { assessUrl, buildRiskReport, webRiskLookup } from "@/lib/security/url-risk";
import { checkPassword } from "@/lib/security/pwned";
import { clientIp, ipHash } from "@/lib/security/ip";
import { createGuardedLookup } from "@/lib/ssrf";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";
import { sanitizeImage, UploadError } from "@/lib/storage";
import { can, canAssignRole, canModerateUser, isPrivileged } from "@/lib/auth/permissions";
import { createHash } from "node:crypto";

describe("TOTP (RFC 6238 vectors)", () => {
  const secret = Buffer.from("12345678901234567890"); // RFC 6238 SHA-1 test key
  it.each([[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]])("T=%i → %s", (t, code) => {
    expect(hotp(secret, Math.floor(t / 30))).toBe(code);
  });
  it("base32 round-trips", () => { expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true); });
  it("accepts ±1 step drift, rejects others and malformed codes", () => {
    const b32 = base32Encode(secret), now = 1_111_111_111_000;
    expect(verifyTotp(b32, "050471", { nowMs: now })).not.toBeNull();
    expect(verifyTotp(b32, "081804", { nowMs: now })).not.toBeNull(); // previous step
    expect(verifyTotp(b32, "287082", { nowMs: now })).toBeNull();
    for (const bad of ["", "12345", "1234567", "abcdef"]) expect(verifyTotp(b32, bad, { nowMs: now })).toBeNull();
  });
  it("rejects reuse of an already-accepted step (replay)", () => {
    const b32 = base32Encode(secret), now = 1_111_111_111_000;
    const step = verifyTotp(b32, "050471", { nowMs: now })!;
    expect(verifyTotp(b32, "050471", { nowMs: now, lastUsedStep: step })).toBeNull();
  });
  it("encrypts secrets at rest (AES-GCM) and detects tampering", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
  it("recovery codes are unique, high-entropy and only their hashes are comparable", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{8}$/);
    expect(hashRecoveryCode(codes[0])).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(codes[0].toUpperCase())).toBe(hashRecoveryCode(codes[0]));
  });
});

describe("RBAC matrix", () => {
  it("is deny-by-default and strictly layered", () => {
    expect(can("STUDENT", "events.save")).toBe(true);
    expect(can("STUDENT", "admin.access")).toBe(false);
    expect(can("ORGANIZER", "event.submit")).toBe(true);
    expect(can("ORGANIZER", "review.submissions")).toBe(false);
    expect(can("MODERATOR", "review.submissions")).toBe(true);
    for (const p of ["events.manage", "organizers.manage", "users.manage", "categories.manage", "sources.manage", "admins.manage", "security.config"] as const) expect(can("MODERATOR", p)).toBe(false);
    expect(can("ADMIN", "events.manage")).toBe(true);
    expect(can("ADMIN", "admins.manage")).toBe(false);
    expect(can("ADMIN", "security.config")).toBe(false);
    expect(can("SUPER_ADMIN", "admins.manage")).toBe(true);
    expect(can(undefined, "events.save")).toBe(false);
    expect(can("GUEST" as never, "events.save")).toBe(false);
  });
  it("only moderators and above are privileged (MFA required)", () => {
    expect(["STUDENT", "ORGANIZER", "MODERATOR", "ADMIN", "SUPER_ADMIN"].map((r) => isPrivileged(r as never))).toEqual([false, false, true, true, true]);
  });
  const u = (id: string, role: string) => ({ id, role: role as never });
  it("role assignment cannot escalate", () => {
    expect(canAssignRole(u("a", "ADMIN"), u("b", "STUDENT"), "ORGANIZER")).toBe(true);
    expect(canAssignRole(u("a", "ADMIN"), u("b", "STUDENT"), "MODERATOR")).toBe(false);
    expect(canAssignRole(u("a", "ADMIN"), u("b", "STUDENT"), "ADMIN")).toBe(false);
    expect(canAssignRole(u("a", "ADMIN"), u("b", "STUDENT"), "SUPER_ADMIN")).toBe(false);
    expect(canAssignRole(u("a", "ADMIN"), u("b", "ADMIN"), "STUDENT")).toBe(false);
    expect(canAssignRole(u("a", "ADMIN"), u("b", "SUPER_ADMIN"), "STUDENT")).toBe(false);
    expect(canAssignRole(u("a", "MODERATOR"), u("b", "STUDENT"), "ORGANIZER")).toBe(false);
    expect(canAssignRole(u("a", "SUPER_ADMIN"), u("b", "STUDENT"), "ADMIN")).toBe(true);
    expect(canAssignRole(u("a", "SUPER_ADMIN"), u("a", "SUPER_ADMIN"), "STUDENT")).toBe(false); // never self
    expect(canAssignRole(u("a", "STUDENT"), u("a", "STUDENT"), "ADMIN")).toBe(false);
    expect(canModerateUser(u("a", "ADMIN"), u("b", "ADMIN"))).toBe(false);
    expect(canModerateUser(u("a", "ADMIN"), u("b", "MODERATOR"))).toBe(false);
    expect(canModerateUser(u("a", "ADMIN"), u("b", "STUDENT"))).toBe(true);
  });
});

describe("Content-Security-Policy", () => {
  const csp = buildCsp({ nonce: "abc123", https: true });
  const dir = (n: string) => csp.split("; ").find((d) => d.startsWith(`${n} `)) ?? "";
  it("uses nonces, no unsafe-eval, no unsafe-inline for scripts or style elements", () => {
    expect(dir("script-src")).toContain("'nonce-abc123'");
    expect(dir("script-src")).not.toMatch(/unsafe-eval|unsafe-inline/);
    expect(dir("style-src")).not.toContain("unsafe-inline");
    expect(dir("style-src-attr")).toBe("style-src-attr 'unsafe-inline'"); // documented, attribute-only exception
  });
  it("locks down objects, base URI, forms, framing and frames", () => {
    expect(dir("object-src")).toBe("object-src 'none'");
    expect(dir("base-uri")).toBe("base-uri 'self'");
    expect(dir("form-action")).toBe("form-action 'self'");
    expect(dir("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(dir("frame-src")).toBe("frame-src 'none'");
    expect(dir("connect-src")).toBe("connect-src 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("allows only configured image hosts and relaxes only in development", () => {
    expect(buildCsp({ nonce: "n", imgHosts: ["https://cdn.example.org"] })).toContain("img-src 'self' data: blob: https://cdn.example.org");
    expect(buildCsp({ nonce: "n", isDev: true })).toContain("'unsafe-eval'");
  });
});

describe("URL risk indicators", () => {
  const codes = (u: string, o = {}) => assessUrl(u, "registrationUrl", o).map((i) => i.code);
  it("blocks dangerous schemes and internal destinations as CRITICAL", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://example.org"]) expect(assessUrl(bad).some((i) => i.severity === "critical")).toBe(true);
    for (const bad of ["https://localhost/x", "https://127.0.0.1/", "https://169.254.169.254/latest", "https://10.0.0.5/", "https://[::1]/", "https://db.internal/"]) expect(assessUrl(bad).some((i) => i.severity === "critical"), bad).toBe(true);
  });
  it("flags phishing-style patterns for human review", () => {
    expect(codes("http://example.org/r")).toContain("insecure-http");
    expect(codes("https://bit.ly/abc")).toContain("url-shortener");
    expect(codes("https://xn--pple-43d.com/")).toContain("punycode-idn");
    expect(codes("https://8.8.8.8/")).toContain("ip-literal-host");
    expect(codes("https://user:pw@example.org/")).toContain("credentials-in-url");
    expect(codes("https://secure-login-verify.example.org/")).toContain("suspicious-keywords");
    expect(codes("https://forms.gle/abc")).toContain("third-party-form");
    expect(codes("https://other.org/r", { relatedHost: "uni.edu.mm" })).toContain("domain-differs-from-source");
  });
  it("a clean-looking HTTPS URL yields no suspicion but is never labelled safe", async () => {
    expect(assessUrl("https://uni.edu.mm/hackathon/register").filter((i) => i.severity !== "info")).toEqual([]);
    const r = await buildRiskReport({ urls: [{ field: "registrationUrl", url: "https://uni.edu.mm/r" }], organizer: { status: "UNVERIFIED" } });
    expect(r.note).toMatch(/never grant approval/i);
    expect(r.webRisk.registrationUrl).toMatchObject({ status: "unchecked" });
    expect(r.indicators.map((i) => i.code)).toContain("organizer-unverified");
  });
});

describe("Web Risk lookup (provider contract)", () => {
  const fake = (body: unknown, ok = true, status = 200) => (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;
  it("reports threats, no-threat-detected (not 'safe'), and never fails open as clean", async () => {
    expect(await webRiskLookup("https://x.test", { apiKey: "k", fetchImpl: fake({ threat: { threatTypes: ["SOCIAL_ENGINEERING"] } }) })).toEqual({ status: "threat", threatTypes: ["SOCIAL_ENGINEERING"] });
    expect(await webRiskLookup("https://x.test", { apiKey: "k", fetchImpl: fake({}) })).toEqual({ status: "no-threat-detected" });
    expect(await webRiskLookup("https://x.test", { apiKey: "k", fetchImpl: fake({}, false, 500) })).toMatchObject({ status: "unchecked" });
    expect(await webRiskLookup("https://x.test", { apiKey: "k", fetchImpl: (async () => { throw new Error("net"); }) as never })).toMatchObject({ status: "unchecked" });
    expect(await webRiskLookup("https://x.test", { apiKey: "" })).toMatchObject({ status: "unchecked", reason: "provider-not-configured" });
  });
  it("a threat-intelligence hit becomes a CRITICAL indicator", async () => {
    const r = await buildRiskReport({ urls: [{ field: "registrationUrl", url: "https://evil.test/x" }], fetchImpl: fake({ threat: { threatTypes: ["MALWARE"] } }) });
    expect(r.hasCritical).toBe(false); // no API key configured in tests → unchecked
    process.env.GOOGLE_WEB_RISK_API_KEY = "k";
    const r2 = await buildRiskReport({ urls: [{ field: "registrationUrl", url: "https://evil.test/x" }], fetchImpl: fake({ threat: { threatTypes: ["MALWARE"] } }) });
    delete process.env.GOOGLE_WEB_RISK_API_KEY;
    expect(r2.hasCritical).toBe(true);
  });
});

describe("breached password screening (k-anonymity)", () => {
  const sha1 = (p: string) => createHash("sha1").update(p).digest("hex").toUpperCase();
  const range = (p: string, count = 3) => (async (url: string) => {
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1(p).slice(0, 5)}`); // only a 5-char prefix is sent
    return { ok: true, text: async () => `${sha1(p).slice(5)}:${count}\r\n00000000000000000000000000000000000:1` };
  }) as unknown as typeof fetch;
  it("detects breached passwords and sends only a hash prefix", async () => {
    expect(await checkPassword("Tr0ub4dor&3-unique", { enabled: true, fetchImpl: range("Tr0ub4dor&3-unique") })).toBe("breached");
  });
  it("passes unknown passwords, and fails open (visibly) when the service is down", async () => {
    expect(await checkPassword("a-very-unusual-passphrase-42", { enabled: true, fetchImpl: (async () => ({ ok: true, text: async () => "ABCDE:1" })) as never })).toBe("ok");
    expect(await checkPassword("anything-long-enough", { enabled: true, fetchImpl: (async () => { throw new Error("down"); }) as never })).toBe("unchecked");
    expect(await checkPassword("anything-long-enough", { enabled: false })).toBe("unchecked");
  });
  it("local denylist works offline", async () => { expect(await checkPassword("Password123", { enabled: false })).toBe("breached"); });
});

describe("client IP trust", () => {
  it("prefers the proxy-set X-Real-IP and ignores forged leading X-Forwarded-For entries", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9"); // right-most = added by our proxy
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("hashes addresses for logs", () => {
    expect(ipHash("203.0.113.9")).toMatch(/^[0-9a-f]{16}$/);
    expect(ipHash("203.0.113.9")).not.toContain("203");
  });
});

describe("SSRF: connection-time address validation (anti-DNS-rebinding)", () => {
  const resolver = (addrs: string[]) => ((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, addrs.map((a) => ({ address: a, family: a.includes(":") ? 6 : 4 })))) as never;
  const run = (addrs: string[], all = false) => new Promise<unknown>((resolve) => createGuardedLookup(resolver(addrs))("h.test", { all } as never, (e, a) => resolve(e ? `ERR:${e.message}` : a)));
  it("allows hosts whose every address is public", async () => { expect(await run(["93.184.216.34"])).toBe("93.184.216.34"); });
  it("refuses private, loopback, metadata and mixed answers (rebinding trick)", async () => {
    for (const a of [["127.0.0.1"], ["10.0.0.7"], ["169.254.169.254"], ["::1"], ["fd00::1"], ["93.184.216.34", "10.0.0.7"]]) expect(await run(a), a.join()).toBe("ERR:Blocked address");
  });
  it("supports the `all` lookup shape used by happy-eyeballs connects", async () => { expect(await run(["93.184.216.34"], true)).toEqual([{ address: "93.184.216.34", family: 4 }]); });
});

describe("Argon2id passwords", () => {
  it("hashes with Argon2id, verifies, and flags legacy hashes for upgrade", async () => {
    const h = await hashPassword("a long passphrase");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("a long passphrase", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
    expect(needsRehash("scrypt$16384$8$1$AA==$AA==")).toBe(true);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("image sanitisation", () => {
  const png = (w = 64, h = 64) => sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } }).png().toBuffer();
  it("re-encodes to WebP and strips EXIF/GPS metadata", async () => {
    const withExif = await sharp(await png()).jpeg().withExif({ IFD0: { Copyright: "secret-owner" }, IFD3: { GPSLatitudeRef: "N" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy(); // precondition
    const out = await sanitizeImage(withExif);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(out.includes(Buffer.from("secret-owner"))).toBe(false);
  });
  it("drops payloads appended after a valid image (polyglot)", async () => {
    const out = await sanitizeImage(Buffer.concat([await png(), Buffer.from("<script>alert(1)</script>PK\u0003\u0004")]));
    expect(out.includes(Buffer.from("<script>"))).toBe(false);
  });
  it("rejects non-images, truncated files and decompression bombs", async () => {
    await expect(sanitizeImage(Buffer.from("<svg onload=alert(1)>"))).rejects.toBeInstanceOf(UploadError);
    await expect(sanitizeImage((await png()).subarray(0, 40))).rejects.toBeInstanceOf(UploadError);
    await expect(sanitizeImage(await png(7000, 7000))).rejects.toBeInstanceOf(UploadError); // 49 MP > 40 MP limit
  });
  it("downsizes oversized images", async () => {
    const meta = await sharp(await sanitizeImage(await png(4000, 3000))).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2000);
  });
});
