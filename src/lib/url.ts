import { isIPLiteral, isInternalHostname, isPrivateIp } from "./ip-ranges";

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)/i;

/**
 * Canonical form for comparing URLs: lowercase host, strip www., fragments,
 * tracking params, default ports and trailing slashes; sort query params.
 * Returns null for anything that isn't a valid http(s) URL.
 */
export function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  keep.sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  let path = u.pathname.replace(/\/+$/, "");
  if (path === "") path = "";
  // Treat http and https as the same resource.
  return `${u.hostname}${u.port ? ":" + u.port : ""}${path}${u.search}`;
}

/**
 * Validate a user-supplied external link before we render or store it. http(s) only, no embedded credentials,
 * never an internal/loopback/private destination. This does NOT mean the destination is verified or safe.
 * Pass `{ httpsOnly: true }` to enforce the HTTPS-by-default policy for submitted links.
 */
export function isSafeExternalUrl(input: string | null | undefined, opts: { httpsOnly?: boolean } = {}): boolean {
  if (!input) return false;
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && !opts.httpsOnly)) return false;
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (isInternalHostname(host)) return false;
    if (isIPLiteral(host)) return !isPrivateIp(host);
    return host.includes(".");
  } catch {
    return false;
  }
}

/** Only allow same-site relative redirects (prevents open redirects). */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
