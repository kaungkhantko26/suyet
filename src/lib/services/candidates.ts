import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, type EventFormat } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";
import { can } from "../auth/permissions";
import { db } from "../db";
import { findDuplicates } from "../events/duplicates";
import { isSafeExternalUrl, normalizeUrl } from "../url";
import { ServiceError, createEvent } from "./events";
import type { EventFormInput } from "../validation/event";

/** Illustrative n8n payload. Only title and sourceUrl are mandatory; everything else may be absent. */
export const candidatePayloadSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(10000).optional(),
  category: z.string().trim().max(100).optional(),
  organizer: z.string().trim().max(200).optional(),
  sourceUrl: z.string().trim().max(1000).refine(isSafeExternalUrl, "sourceUrl must be a valid http(s) URL"),
  registrationUrl: z.string().trim().max(1000).refine(isSafeExternalUrl, "registrationUrl must be a valid http(s) URL").optional(),
  startDate: z.string().trim().max(40).optional(),
  endDate: z.string().trim().max(40).optional(),
  registrationDeadline: z.string().trim().max(40).optional(),
  format: z.string().trim().max(20).optional(),
  location: z.string().trim().max(200).optional(),
});
export type CandidatePayload = z.infer<typeof candidatePayloadSchema>;

export type AuthMode = "hmac" | "bearer" | "both";
export type AuthVerdict = { ok: true; kind: "bearer" | "hmac"; requestId?: string } | { ok: false; reason: "missing" | "bad-signature" | "expired" | "bad-bearer" | "mode-disabled" | "no-secret" };

/** Production defaults to signed requests only; set INTERNAL_AUTH_MODE=both|bearer to relax (e.g. local n8n tests). */
export const defaultAuthMode = (): AuthMode => (process.env.INTERNAL_AUTH_MODE as AuthMode) || (process.env.NODE_ENV === "production" ? "hmac" : "both");

/** Current secret plus an optional previous one, so secrets can be rotated without downtime. */
export const internalSecrets = () => [process.env.INTERNAL_API_SECRET, process.env.INTERNAL_API_SECRET_PREVIOUS].filter((x): x is string => !!x);

const safeEq = (a: string, b: string) => {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

/**
 * Machine authentication for n8n.
 *  HMAC: X-Timestamp (unix s) + X-Request-Id (unique) + X-Signature: sha256=hex(HMAC(secret, `${ts}.${requestId}.${rawBody}`)).
 *        Signs the exact body, rejects stale timestamps (5 min), compares in constant time. The caller must also
 *        register the request id (see claimRequestId) so a captured request cannot be replayed.
 *  Bearer: shared secret header, allowed only when the mode permits it.
 */
export function verifyInternalAuth(headers: Headers, rawBody: string, secrets: string[] | string | undefined, opts: { now?: number; mode?: AuthMode } = {}): AuthVerdict {
  const list = (Array.isArray(secrets) ? secrets : secrets ? [secrets] : []).filter(Boolean);
  if (!list.length) return { ok: false, reason: "no-secret" };
  const mode = opts.mode ?? "both";
  const bearer = headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    if (mode === "hmac") return { ok: false, reason: "mode-disabled" };
    return list.some((sec) => safeEq(bearer.slice(7), sec)) ? { ok: true, kind: "bearer" } : { ok: false, reason: "bad-bearer" };
  }
  const sig = headers.get("x-signature"), ts = headers.get("x-timestamp"), id = headers.get("x-request-id");
  if (!sig || !ts || !id) return { ok: false, reason: "missing" };
  if (mode === "bearer") return { ok: false, reason: "mode-disabled" };
  if (!/^[\w-]{8,100}$/.test(id)) return { ok: false, reason: "missing" };
  const age = Math.abs((opts.now ?? Date.now()) - Number(ts) * 1000);
  if (!Number.isFinite(age) || age > 5 * 60_000) return { ok: false, reason: "expired" };
  const good = list.some((sec) => safeEq(sig, "sha256=" + createHmac("sha256", sec).update(`${ts}.${id}.${rawBody}`).digest("hex")));
  return good ? { ok: true, kind: "hmac", requestId: id } : { ok: false, reason: "bad-signature" };
}

/** Records a signed request id. Returns false when it was already seen (replay). Ids expire after the 10-minute window. */
export async function claimRequestId(id: string): Promise<boolean> {
  await db.replayNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  try {
    await db.replayNonce.create({ data: { id: `n8n:${id}`, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export function parseFormat(v?: string): EventFormat | null {
  const s = v?.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s === "online" || s === "virtual") return "ONLINE";
  if (s === "onsite" || s === "inperson" || s === "physical") return "ONSITE";
  if (s === "hybrid") return "HYBRID";
  return null;
}

function parseDate(v: string | undefined, label: string, issues: string[]): Date | null {
  if (!v) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(v);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) { issues.push(`${label}: not a valid date`); return null; }
  // A date without an offset is ambiguous; we refuse to guess a timezone.
  if (!hasZone) { issues.push(`${label}: missing timezone offset`); return null; }
  return d;
}

export async function ingestCandidate(payload: CandidatePayload, idempotencyKeyHeader?: string | null, sourceId?: string | null, extraIssues: string[] = []) {
  const issues: string[] = [...extraIssues];
  const startAt = parseDate(payload.startDate, "startDate", issues);
  const endAt = parseDate(payload.endDate, "endDate", issues);
  const deadline = parseDate(payload.registrationDeadline, "registrationDeadline", issues);
  if (startAt && endAt && endAt < startAt) issues.push("endDate: before startDate");
  if (startAt && deadline && deadline > startAt) issues.push("registrationDeadline: after startDate");
  if (startAt && startAt.getTime() < Date.now()) issues.push("startDate: in the past");
  const format = parseFormat(payload.format);
  if (payload.format && !format) issues.push("format: unrecognised value");

  const nSource = normalizeUrl(payload.sourceUrl)!;
  const nReg = normalizeUrl(payload.registrationUrl);
  const key = idempotencyKeyHeader?.trim().slice(0, 200)
    || createHash("sha256").update([nSource, payload.title.toLowerCase(), payload.startDate ?? ""].join("|")).digest("hex");

  const existing = await db.eventCandidate.findUnique({ where: { idempotencyKey: key } });
  if (existing) return { candidate: existing, created: false };

  const missing: string[] = [];
  if (!payload.description) missing.push("description");
  if (!payload.category) missing.push("category");
  if (!payload.organizer) missing.push("organizer");
  if (!payload.registrationUrl) missing.push("registrationUrl");
  if (!startAt) missing.push("startDate");
  if (!deadline) missing.push("registrationDeadline");
  if (!format) missing.push("format");
  if (!payload.location) missing.push("location");

  // Duplicate detection: compare against events and earlier candidates. Flag, never merge.
  const host = nSource.split("/")[0];
  const day = 86_400_000;
  const events = await db.event.findMany({
    where: {
      deletedAt: null,
      OR: [
        { sourceUrl: { contains: host, mode: "insensitive" } },
        ...(nReg ? [{ registrationUrl: { contains: nReg.split("/")[0], mode: "insensitive" as const } }] : []),
        ...(startAt ? [{ startAt: { gte: new Date(startAt.getTime() - day), lte: new Date(startAt.getTime() + day) } }] : []),
        { title: { equals: payload.title, mode: "insensitive" } },
      ],
    },
    include: { organizer: { select: { name: true } } },
    take: 200,
  });
  const matches = findDuplicates(
    { title: payload.title, organizerName: payload.organizer, sourceUrl: payload.sourceUrl, registrationUrl: payload.registrationUrl, startAt },
    events.map((e) => ({ id: e.id, title: e.title, organizerName: e.organizer.name, sourceUrl: e.sourceUrl, registrationUrl: e.registrationUrl, startAt: e.startAt })),
  );
  const priorCandidate = await db.eventCandidate.findFirst({
    where: { status: { in: ["PENDING_REVIEW", "APPROVED"] }, OR: [{ normalizedSourceUrl: nSource }, ...(nReg ? [{ normalizedRegistrationUrl: nReg }] : [])] },
    select: { id: true },
  });
  const reasons = [...(matches[0]?.reasons ?? []), ...(priorCandidate ? ["same-url-as-earlier-candidate"] : [])];

  try {
    const candidate = await db.eventCandidate.create({
      data: {
        status: "PENDING_REVIEW", // never auto-published
        idempotencyKey: key,
        title: payload.title,
        description: payload.description,
        categoryName: payload.category,
        organizerName: payload.organizer,
        sourceUrl: payload.sourceUrl,
        normalizedSourceUrl: nSource,
        registrationUrl: payload.registrationUrl,
        normalizedRegistrationUrl: nReg,
        startAt, endAt, registrationDeadline: deadline,
        format,
        locationText: payload.location,
        missingFields: missing,
        validationIssues: issues,
        duplicateOfEventId: matches[0]?.id ?? null,
        duplicateReasons: reasons,
        rawPayload: payload as Prisma.InputJsonValue,
        sourceId: sourceId ?? null,
      },
    });
    return { candidate, created: true };
  } catch (e) {
    // Lost a race with a concurrent identical request: return the winner.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await db.eventCandidate.findUniqueOrThrow({ where: { idempotencyKey: key } });
      return { candidate: winner, created: false };
    }
    throw e;
  }
}

/** Turn a reviewed candidate into a DRAFT event. The admin supplies anything the source didn't provide. */
export async function promoteCandidate(
  admin: { id: string; role: import("@prisma/client").Role },
  candidateId: string,
  input: EventFormInput & { organizerId: string },
) {
  if (!can(admin.role, "review.candidates")) throw new ServiceError("forbidden");
  const c = await db.eventCandidate.findUnique({ where: { id: candidateId } });
  if (!c) throw new ServiceError("notFound");
  if (c.status !== "PENDING_REVIEW") throw new ServiceError("invalidState");
  const event = await createEvent(admin, input.organizerId, { ...input, sourceUrl: input.sourceUrl ?? c.sourceUrl });
  await db.$transaction([
    db.event.update({ where: { id: event.id }, data: { sourceId: c.sourceId } }),
    db.eventCandidate.update({ where: { id: c.id }, data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date(), promotedEventId: event.id } }),
  ]);
  await audit(admin.id, "candidate.promote", "EventCandidate", c.id, { eventId: event.id });
  return event;
}

export async function rejectCandidate(admin: { id: string; role: import("@prisma/client").Role }, candidateId: string, notes?: string, asDuplicate = false) {
  if (!can(admin.role, "review.candidates")) throw new ServiceError("forbidden");
  await db.eventCandidate.update({
    where: { id: candidateId },
    data: { status: asDuplicate ? "DUPLICATE" : "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), reviewNotes: notes },
  });
  await audit(admin.id, asDuplicate ? "candidate.duplicate" : "candidate.reject", "EventCandidate", candidateId, { notes });
}
