/** Content-Security-Policy builder. Pure function so it can be unit-tested. */
export function buildCsp(opts: { nonce: string; isDev?: boolean; https?: boolean; imgHosts?: string[]; reportUri?: string }): string {
  const { nonce, isDev = false, https = true, imgHosts = [], reportUri } = opts;
  const d: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets nonce'd Next.js bootstrap scripts load their chunks; no unsafe-inline / unsafe-eval in production.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-inline'"] : [])],
    // Documented, narrowly scoped exception: inline style ATTRIBUTES only (dynamic widths/colours in a few components).
    // Inline <style> elements and scripts stay locked to the nonce.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...imgHosts],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:", "wss:"] : [])],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
  };
  const parts = Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (https && !isDev) parts.push("upgrade-insecure-requests");
  if (reportUri) parts.push(`report-uri ${reportUri}`);
  return parts.join("; ");
}
