/** Pure (browser-safe) IP classification helpers shared by URL validation and the SSRF guard. */
const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export const isIPv4 = (s: string) => { const m = V4.exec(s); return !!m && m.slice(1).every((n) => Number(n) <= 255); };
export const isIPv6 = (s: string) => s.includes(":") && /^[0-9a-f:.]+$/i.test(s);
export const isIPLiteral = (s: string) => isIPv4(s) || isIPv6(s);

/** True for loopback, private, link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast and reserved ranges. */
export function isPrivateIp(ip: string): boolean {
  if (isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::" || /^fe[89ab]/.test(l) || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("ff")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (mapped) return isPrivateIp(mapped[1]);
    // NAT64 / 6to4 embed IPv4 destinations: refuse rather than parse.
    return l.startsWith("64:ff9b:") || l.startsWith("2002:");
  }
  if (!isIPv4(ip)) return true; // unparseable → treat as unsafe
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata"]);
export function isInternalHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return BLOCKED_HOSTNAMES.has(h) || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local");
}
