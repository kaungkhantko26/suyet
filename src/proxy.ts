import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/security/csp";

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware):
 *  - assigns a request id (kept if the edge proxy already set a valid one) for log/audit correlation,
 *  - creates a per-request nonce and sets the Content-Security-Policy so Next.js can nonce its own scripts.
 * CSP_MODE: "enforce" (default in production) | "report-only" (trial) | "off".
 */
export function proxy(req: NextRequest) {
  const incoming = req.headers.get("x-request-id");
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";
  const mode = process.env.CSP_MODE ?? (isDev ? "off" : "enforce");

  const headers = new Headers(req.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-nonce", nonce);

  let csp: string | null = null;
  if (mode !== "off") {
    const s3 = process.env.S3_PUBLIC_URL ? [new URL(process.env.S3_PUBLIC_URL).origin] : [];
    csp = buildCsp({ nonce, isDev, https: (process.env.APP_URL ?? "").startsWith("https:"), imgHosts: s3, reportUri: "/api/csp-report" });
    headers.set("content-security-policy", csp); // Next reads the nonce from the request header
  }
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", requestId);
  if (csp) res.headers.set(mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Skip static assets and the service worker; API routes still get a request id.
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|sw.js|manifest.webmanifest|robots.txt).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
