import type { NextResponse } from "next/server";
import { apiError, apiJson, requestIdFrom } from "@/lib/api";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { clientIp, isLimited, rateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security/events";
import { candidatePayloadSchema, claimRequestId, defaultAuthMode, ingestCandidate, internalSecrets, verifyInternalAuth } from "@/lib/services/candidates";
import { isSwitchOn } from "@/lib/services/switches";

export const dynamic = "force-dynamic";
const MAX_BYTES = 100_000;

/**
 * n8n → this platform. The integration identity can ONLY create event candidates (always PENDING_REVIEW) and read the
 * processing status of a candidate. It cannot approve, publish, change roles or read personal data.
 * Responses are explicit DTOs (never raw database rows). Credentials are never echoed.
 */
type Auth = { error: NextResponse; ip?: never } | { error?: never; ip: string };

async function authenticate(req: Request, raw: string, rid: string): Promise<Auth> {
  const ip = clientIp(req.headers);
  // Throttle FAILED authentication per IP before doing any secret comparison.
  if ((await isLimited(`internal:authfail:${ip}`, 20)).limited) return { error: apiError(429, "rate_limited", "Too many failed attempts", rid, {}, { "Retry-After": "300" }) };
  const secrets = internalSecrets();
  const v = verifyInternalAuth(req.headers, raw, secrets, { mode: defaultAuthMode() });
  if (!v.ok) {
    await rateLimit(`internal:authfail:${ip}`, 20, 300);
    await recordSecurityEvent({ type: "internal_api.auth_failed", severity: "MEDIUM", outcome: "failure", ip, requestId: rid, resourceType: "internal-api", metadata: { reason: v.reason, path: new URL(req.url).pathname } });
    return { error: apiError(401, "unauthorized", "Missing or invalid credentials", rid, {}, { "WWW-Authenticate": "Bearer" }) };
  }
  if (v.kind === "hmac" && !(await claimRequestId(v.requestId!))) {
    await recordSecurityEvent({ type: "internal_api.replay_blocked", severity: "HIGH", outcome: "blocked", ip, requestId: rid, resourceType: "internal-api" });
    return { error: apiError(409, "replayed_request", "This request id was already used", rid) };
  }
  return { ip };
}

export async function POST(req: Request) {
  const started = Date.now();
  const rid = requestIdFrom(req);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return apiError(413, "payload_too_large", `Body must be at most ${MAX_BYTES} bytes`, rid);
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return apiError(413, "payload_too_large", `Body must be at most ${MAX_BYTES} bytes`, rid);

  const auth = await authenticate(req, raw, rid);
  if (auth.error) return auth.error;

  if (await isSwitchOn("automation_paused")) return apiError(503, "automation_paused", "Automation is temporarily paused", rid, {}, { "Retry-After": "600" });
  const rl = await rateLimit("internal:event-candidates", 120, 60);
  if (!rl.allowed) return apiError(429, "rate_limited", "Too many requests", rid, {}, { "Retry-After": String(rl.retryAfterSec) });

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return apiError(400, "invalid_json", "Body must be valid JSON", rid); }
  const parsed = candidatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Payload failed validation", rid, { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  try {
    const { candidate, created } = await ingestCandidate(parsed.data, req.headers.get("idempotency-key"));
    log("info", "event candidate ingested", { id: candidate.id, created, requestId: rid, duplicateReasons: candidate.duplicateReasons, ms: Date.now() - started });
    return apiJson(
      { id: candidate.id, status: candidate.status, idempotentReplay: !created, possibleDuplicate: candidate.duplicateReasons.length > 0, duplicateReasons: candidate.duplicateReasons, missingFields: candidate.missingFields, validationIssues: candidate.validationIssues, requestId: rid },
      created ? 201 : 200, rid,
    );
  } catch (e) {
    log("error", "event candidate ingest failed", { requestId: rid, error: String(e) });
    return apiError(500, "internal_error", "Could not store candidate", rid);
  }
}

/** Limited processing status: GET ?id=<candidate id> → { id, status }. Nothing else is readable. */
export async function GET(req: Request) {
  const rid = requestIdFrom(req);
  const auth = await authenticate(req, "", rid);
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(400, "invalid_id", "Provide ?id=<candidate id>", rid);
  const c = await db.eventCandidate.findUnique({ where: { id }, select: { id: true, status: true, createdAt: true } });
  return c ? apiJson({ id: c.id, status: c.status, createdAt: c.createdAt.toISOString() }, 200, rid) : apiError(404, "not_found", "Unknown candidate", rid);
}

