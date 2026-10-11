import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { config } from "./config";
import { isIPLiteral, isInternalHostname, isPrivateIp } from "./ip-ranges";

export { isPrivateIp };

/** Static checks that need no DNS: scheme, credentials, well-known internal names, IP literals. */
export function assertAllowedUrlSyntax(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Blocked protocol");
  if (u.username || u.password) throw new Error("Credentials in URL are not allowed");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isInternalHostname(host)) throw new Error("Blocked host");
  if (isIPLiteral(host) && isPrivateIp(host)) throw new Error("Blocked address");
  return u;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;
type Resolver = (hostname: string, options: dns.LookupAllOptions, cb: (err: NodeJS.ErrnoException | null, addrs: dns.LookupAddress[]) => void) => void;

/**
 * DNS lookup used at CONNECTION time. Because validation happens on the very addresses the socket will use, a hostname
 * that flips from a public to a private address between "check" and "connect" (DNS rebinding) cannot reach internal hosts.
 * If ANY resolved address is non-public, the connection is refused.
 */
export function createGuardedLookup(resolver: Resolver = (h, o, cb) => dns.lookup(h, o, cb as never)) {
  return (hostname: string, options: dns.LookupOptions, cb: LookupCallback) => {
    resolver(hostname, { ...options, all: true } as dns.LookupAllOptions, (err, addrs) => {
      if (err) return cb(err);
      if (!addrs?.length || addrs.some((a) => isPrivateIp(a.address))) return cb(Object.assign(new Error("Blocked address"), { code: "EBLOCKED" }));
      if (options.all) return cb(null, addrs);
      cb(null, addrs[0].address, addrs[0].family);
    });
  };
}

/** Resolve-and-check up front too (gives clean errors and covers pure validation callers). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = assertAllowedUrlSyntax(raw);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIPLiteral(host)) return u;
  const addrs = await dns.promises.lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Blocked address");
  return u;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  method?: "GET" | "HEAD";
  /** Content-type prefixes accepted for GET bodies (e.g. ["text/html", "application/json"]). Omit to allow any. */
  allowedTypes?: string[];
}

let agent: Agent | null = null;
const guardedAgent = () => (agent ??= new Agent({ connect: { lookup: createGuardedLookup() as never, timeout: 5000 } }));

/**
 * SSRF-hardened fetch: http(s) only, no credentials, blocked internal names/ranges, destination validated again at
 * connect time (anti-rebinding), manual redirects re-validated per hop with a depth limit, timeout, size cap and an
 * optional content-type allowlist. Internal credentials are never attached. For defence in depth also restrict the
 * container's egress at the firewall (see docs/DEPLOYMENT_SECURITY.md).
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}) {
  const { timeoutMs = 8000, maxRedirects = 3, maxBytes = 1_000_000, method = "GET", allowedTypes } = opts;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    assertAllowedUrlSyntax(current);
    const res = await undiciFetch(current, {
      method,
      redirect: "manual",
      dispatcher: guardedAgent(),
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": `${config.brandName.replace(/\s+/g, "")}Bot/1.0 (+${config.appUrl})` },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue;
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (method === "GET" && allowedTypes && !allowedTypes.some((t) => type.startsWith(t))) {
      await res.body?.cancel();
      throw new Error("Unsupported content type");
    }
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    while (reader && method === "GET") {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes) { await reader.cancel(); throw new Error("Response too large"); }
      chunks.push(value);
    }
    return { status: res.status, ok: res.ok, finalUrl: current, body: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("Too many redirects");
}
