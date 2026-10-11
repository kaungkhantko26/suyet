import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Receives CSP violation reports (used while trialling report-only, and to spot breakage/attacks after enforcement). */
export async function POST(req: Request) {
  const rl = await rateLimit(`csp:${clientIp(req.headers)}`, 30, 60);
  if (!rl.allowed) return new NextResponse(null, { status: 429 });
  const raw = await req.text();
  if (raw.length > 10_000) return new NextResponse(null, { status: 413 });
  try {
    const body = JSON.parse(raw);
    const r = body["csp-report"] ?? body;
    // Only a few non-sensitive fields; query strings are stripped from URLs.
    const strip = (u: unknown) => (typeof u === "string" ? u.split("?")[0].slice(0, 200) : undefined);
    log("warn", "csp-violation", { directive: r["effective-directive"] ?? r["violated-directive"], blocked: strip(r["blocked-uri"] ?? r.blockedURL), document: strip(r["document-uri"] ?? r.documentURL) });
  } catch { /* ignore malformed reports */ }
  return new NextResponse(null, { status: 204 });
}
