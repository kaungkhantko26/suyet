import { Prisma, type Event, type Role, type VerificationStatus } from "@prisma/client";
import { can, type Permission } from "../auth/permissions";
import { audit } from "../audit";
import { db } from "../db";
import { enqueue } from "../jobs";
import { findDuplicates } from "../events/duplicates";
import { rateLimit } from "../rate-limit";
import { recordSecurityEvent } from "../security/events";
import { buildRiskReport, type RiskIndicator, type RiskReport } from "../security/url-risk";
import { isSwitchOn } from "./switches";
import { slugify, uniqueSlug } from "../slug";
import { normalizeUrl } from "../url";
import { changedSubstantialFields, parseSchedule, type EventFormInput } from "../validation/event";

export class ServiceError extends Error {
  constructor(public code: "forbidden" | "notFound" | "invalidState" | "needsEvidence" | "duplicate" | "disabled" | "needsAcknowledgement" | "rateLimited", message?: string) {
    super(message ?? code);
  }
}

interface Actor { id: string; role: Role }

function need(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) throw new ServiceError("forbidden");
}

/** Object-level ownership check, run on every organizer-scoped operation. Staff with events.manage may act on any organizer. */
export async function assertCanManage(actor: Actor, organizerId: string) {
  if (can(actor.role, "events.manage")) return;
  need(actor, "event.edit.own");
  const m = await db.organizerMember.findFirst({
    where: { userId: actor.id, organizerId, organizer: { deletedAt: null, status: { not: "SUSPENDED" } } },
  });
  if (!m) throw new ServiceError("forbidden");
}

export function toEventData(input: EventFormInput) {
  return {
    title: input.title,
    shortDescription: input.shortDescription,
    description: input.description,
    startAt: input.startAt!,
    endAt: input.endAt,
    registrationDeadline: input.registrationDeadline,
    format: input.format,
    country: input.country,
    locationId: input.locationId ?? null,
    city: input.city ?? null,
    venue: input.venue ?? null,
    address: input.address ?? null,
    onlineUrl: input.onlineUrl ?? null,
    registrationMode: input.registrationMode,
    // On-site registration has no external link; the form lives on this website.
    registrationUrl: input.registrationMode === "ON_PLATFORM" ? null : (input.registrationUrl ?? null),
    sourceUrl: input.sourceUrl ?? null,
    eligibility: input.eligibility ?? null,
    skillLevel: input.skillLevel,
    requirements: input.requirements ?? null,
    feeAmount: input.feeAmount,
    currency: input.currency,
    teamAllowed: input.teamAllowed,
    minTeamSize: input.teamAllowed ? (input.minTeamSize ?? null) : null,
    maxTeamSize: input.teamAllowed ? (input.maxTeamSize ?? null) : null,
    prizes: input.prizes ?? null,
    schedule: parseSchedule(input.scheduleText),
    contactInfo: input.contactInfo ?? null,
  };
}

/** Create a draft event owned by an organizer. Never public until approved. */
export async function createEvent(actor: Actor, organizerId: string, input: EventFormInput, bannerUrl?: string | null) {
  await assertCanManage(actor, organizerId);
  const slug = await uniqueSlug(input.slug || input.title, async (s) => !!(await db.event.findUnique({ where: { slug: s } })));
  return db.event.create({
    data: {
      ...toEventData(input),
      schedule: toEventData(input).schedule as Prisma.InputJsonValue,
      slug,
      bannerUrl: bannerUrl ?? null,
      organizerId,
      publishState: "DRAFT",
      categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
    },
  });
}

/**
 * Assemble automated risk indicators for the reviewer: URL heuristics, optional threat-intelligence lookup,
 * organizer verification state and possible duplicates. Advisory only: this never approves or verifies anything.
 */
export async function assessEventRisk(
  ev: { id?: string; title: string; startAt: Date; registrationUrl: string | null; sourceUrl: string | null; onlineUrl: string | null; organizerId: string },
): Promise<RiskReport> {
  const org = await db.organizer.findUnique({ where: { id: ev.organizerId }, select: { name: true, status: true, contactEmail: true, website: true } });
  const extra: RiskIndicator[] = [];
  if (ev.startAt.getTime() < Date.now()) extra.push({ code: "start-in-past", severity: "medium", detail: "Event start date is already in the past" });
  if (!ev.sourceUrl) extra.push({ code: "no-official-source", severity: "medium", detail: "No official source URL was provided" });
  const nearby = await db.event.findMany({
    where: { deletedAt: null, ...(ev.id ? { id: { not: ev.id } } : {}), OR: [{ startAt: { gte: new Date(ev.startAt.getTime() - 86_400_000), lte: new Date(ev.startAt.getTime() + 86_400_000) } }, ...(ev.sourceUrl ? [{ sourceUrl: ev.sourceUrl }] : []), ...(ev.registrationUrl ? [{ registrationUrl: ev.registrationUrl }] : [])] },
    include: { organizer: { select: { name: true } } }, take: 100,
  });
  for (const m of findDuplicates({ title: ev.title, organizerName: org?.name, sourceUrl: ev.sourceUrl, registrationUrl: ev.registrationUrl, startAt: ev.startAt }, nearby.map((e) => ({ id: e.id, title: e.title, organizerName: e.organizer.name, sourceUrl: e.sourceUrl, registrationUrl: e.registrationUrl, startAt: e.startAt })))) {
    extra.push({ code: m.confidence === "EXACT" ? "duplicate-exact" : "duplicate-possible", severity: m.confidence === "EXACT" ? "high" : "medium", detail: `Matches existing event ${m.id} (${m.reasons.join(", ")})` });
  }
  return buildRiskReport({
    urls: [{ field: "registrationUrl", url: ev.registrationUrl }, { field: "sourceUrl", url: ev.sourceUrl }, { field: "onlineUrl", url: ev.onlineUrl }],
    sourceUrl: ev.sourceUrl, organizer: org ?? undefined, extra, allowHttp: process.env.ALLOW_HTTP_URLS === "1",
  });
}

export async function submitForReview(actor: Actor, eventId: string) {
  if (await isSwitchOn("submissions_disabled")) throw new ServiceError("disabled", "submissions are temporarily disabled");
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw new ServiceError("notFound");
  await assertCanManage(actor, event.organizerId);
  if (event.publishState === "ARCHIVED") throw new ServiceError("invalidState");
  if (event.publishState === "PUBLISHED") throw new ServiceError("invalidState", "already published");
  const open = await db.eventSubmission.findFirst({ where: { eventId, status: "PENDING_REVIEW" } });
  if (open) return open;
  const rl = await rateLimit(`submit:${event.organizerId}`, 10, 86_400); // 10 submissions per organizer per day
  if (!rl.allowed) {
    await recordSecurityEvent({ type: "submission.rate_limited", severity: "MEDIUM", outcome: "blocked", actorId: actor.id, resourceType: "Organizer", resourceId: event.organizerId });
    throw new ServiceError("rateLimited");
  }
  const riskReport = await assessEventRisk(event);
  const sub = await db.eventSubmission.create({
    data: { eventId, organizerId: event.organizerId, submittedById: actor.id, status: "PENDING_REVIEW", riskReport: riskReport as unknown as Prisma.InputJsonValue },
  });
  if (riskReport.hasCritical) await recordSecurityEvent({ type: "event.high_risk_submission", severity: "HIGH", actorId: actor.id, resourceType: "EventSubmission", resourceId: sub.id, metadata: { codes: riskReport.indicators.filter((i) => i.severity === "critical").map((i) => i.code) } });
  return sub;
}

/**
 * Update an event. For published events edited by organizers, "substantial" changes
 * (dates, links, location, fee…) are NOT applied: they are queued as a review submission
 * and the live listing stays unchanged until an admin approves.
 */
export async function updateEvent(
  actor: Actor,
  eventId: string,
  input: EventFormInput,
  bannerUrl?: string | null,
): Promise<{ applied: boolean; queuedForReview: boolean; slug: string }> {
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, include: { categories: true } });
  if (!event) throw new ServiceError("notFound");
  await assertCanManage(actor, event.organizerId);
  const data = toEventData(input);
  const banner = bannerUrl === undefined ? {} : { bannerUrl };
  const categoryOps = {
    categories: { deleteMany: {}, create: input.categoryIds.map((categoryId) => ({ categoryId })) },
  };
  const json = (s: unknown) => s as Prisma.InputJsonValue;

  const isLiveOrganizerEdit = event.publishState === "PUBLISHED" && !can(actor.role, "events.manage");
  if (!isLiveOrganizerEdit) {
    await db.$transaction(async (tx) => {
      await tx.event.update({ where: { id: eventId }, data: { ...data, schedule: json(data.schedule), ...banner, ...categoryOps } });
      if (can(actor.role, "events.manage")) await audit(actor.id, "event.update", "Event", eventId, { title: data.title }, tx);
    });
    if (event.publishState === "PUBLISHED") await enqueue("notify-savers", { eventId, type: "EVENT_UPDATED", window: String(Date.now()) });
    return { applied: true, queuedForReview: false, slug: event.slug };
  }

  const changed = changedSubstantialFields(event as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
  if (changed.length === 0) {
    await db.event.update({ where: { id: eventId }, data: { ...data, schedule: json(data.schedule), ...banner, ...categoryOps } });
    return { applied: true, queuedForReview: false, slug: event.slug };
  }
  const proposedRisk = await assessEventRisk({ ...event, title: data.title, startAt: data.startAt, registrationUrl: data.registrationUrl, sourceUrl: data.sourceUrl, onlineUrl: data.onlineUrl });
  // Apply only the non-substantial fields now.
  const safe: Record<string, unknown> = { ...data, schedule: json(data.schedule) };
  for (const k of changed) delete safe[k];
  await db.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { ...(safe as Prisma.EventUpdateInput), ...banner, ...categoryOps } });
    // Replace any older pending update with the latest proposal.
    await tx.eventSubmission.deleteMany({ where: { eventId, isUpdate: true, status: "PENDING_REVIEW" } });
    const proposed: Record<string, unknown> = {};
    for (const k of changed) proposed[k] = (data as Record<string, unknown>)[k] instanceof Date ? ((data as Record<string, unknown>)[k] as Date).toISOString() : (data as Record<string, unknown>)[k];
    await tx.eventSubmission.create({
      data: { eventId, organizerId: event.organizerId, submittedById: actor.id, status: "PENDING_REVIEW", isUpdate: true, changes: json({ fields: changed, values: proposed }), riskReport: json(proposedRisk) },
    });
  });
  return { applied: false, queuedForReview: true, slug: event.slug };
}

const DATE_FIELDS = new Set(["startAt", "endAt", "registrationDeadline"]);

export async function reviewSubmission(
  admin: Actor,
  submissionId: string,
  decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  notes?: string,
) {
  need(admin, "review.submissions");
  if (decision !== "APPROVED" && !notes?.trim()) throw new ServiceError("invalidState", "notes required");
  const result = await db.$transaction(async (tx) => {
    const sub = await tx.eventSubmission.findUnique({ where: { id: submissionId }, include: { event: true } });
    if (!sub) throw new ServiceError("notFound");
    if (sub.status !== "PENDING_REVIEW") throw new ServiceError("invalidState", "already reviewed");
    // A submission carrying a CRITICAL indicator can only be approved with a written justification (conscious override).
    const risk = sub.riskReport as { hasCritical?: boolean } | null;
    if (decision === "APPROVED" && risk?.hasCritical && (notes ?? "").trim().length < 10) throw new ServiceError("needsAcknowledgement");
    await tx.eventReview.create({ data: { submissionId, reviewerId: admin.id, decision, notes } });
    await tx.eventSubmission.update({ where: { id: submissionId }, data: { status: decision } });

    let kind: "published" | "updated" | "none" = "none";
    if (decision === "APPROVED") {
      if (sub.isUpdate && sub.changes) {
        const { values } = sub.changes as { values: Record<string, unknown> };
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(values)) patch[k] = DATE_FIELDS.has(k) && typeof v === "string" ? new Date(v) : v;
        await tx.event.update({ where: { id: sub.eventId }, data: patch as Prisma.EventUpdateInput });
        // Material change after approval: previous verification no longer covers the new details.
        if (sub.event.verificationStatus === "VERIFIED") {
          await tx.event.update({ where: { id: sub.eventId }, data: { verificationStatus: "NEEDS_REVIEW" } });
        }
        kind = "updated";
      } else {
        await tx.event.update({ where: { id: sub.eventId }, data: { publishState: "PUBLISHED", publishedAt: sub.event.publishedAt ?? new Date() } });
        kind = "published";
      }
    }
    await audit(admin.id, `submission.${decision.toLowerCase()}`, "EventSubmission", submissionId, { eventId: sub.eventId, notes }, tx);
    return { eventId: sub.eventId, kind };
  });
  if (result.kind === "published") await enqueue("notify-new-event", { eventId: result.eventId }, { dedupeKey: `nne:${result.eventId}` });
  if (result.kind === "updated") await enqueue("notify-savers", { eventId: result.eventId, type: "EVENT_UPDATED", window: String(Date.now()) });
  return result;
}

export async function setPublishState(admin: Actor, eventId: string, state: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  need(admin, "events.manage");
  const ev = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!ev) throw new ServiceError("notFound");
  await db.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { publishState: state, publishedAt: state === "PUBLISHED" ? (ev.publishedAt ?? new Date()) : ev.publishedAt, ...(state !== "PUBLISHED" ? { featured: false } : {}) } });
    await audit(admin.id, `event.${state.toLowerCase()}`, "Event", eventId, { from: ev.publishState }, tx);
  });
  if (state === "PUBLISHED" && ev.publishState !== "PUBLISHED") await enqueue("notify-new-event", { eventId }, { dedupeKey: `nne:${eventId}` });
}

export async function setFeatured(admin: Actor, eventId: string, featured: boolean) {
  need(admin, "events.manage");
  const ev = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!ev) throw new ServiceError("notFound");
  if (featured && ev.publishState !== "PUBLISHED") throw new ServiceError("invalidState", "only published events can be featured");
  await db.event.update({ where: { id: eventId }, data: { featured } });
  await audit(admin.id, featured ? "event.feature" : "event.unfeature", "Event", eventId);
}

export async function softDeleteEvent(admin: Actor, eventId: string) {
  need(admin, "events.manage");
  await db.event.update({ where: { id: eventId }, data: { deletedAt: new Date(), publishState: "ARCHIVED", featured: false } });
  await audit(admin.id, "event.delete", "Event", eventId);
}

/** Cancellation / registration overrides: organizers of the event or admins. */
export async function setOverrides(actor: Actor, eventId: string, o: { cancelled?: boolean; registrationClosedOverride?: boolean }) {
  const ev = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!ev) throw new ServiceError("notFound");
  await assertCanManage(actor, ev.organizerId);
  await db.event.update({ where: { id: eventId }, data: o });
  if (can(actor.role, "events.manage")) await audit(actor.id, "event.overrides", "Event", eventId, o);
  if (o.cancelled && !ev.cancelled) await enqueue("notify-savers", { eventId, type: "EVENT_CANCELLED", window: "cancel" }, { dedupeKey: `cancel:${eventId}` });
}

/**
 * Verification requires evidence: an official source URL and a human reviewer.
 * VERIFIED without a source URL is rejected.
 */
export async function setVerification(
  admin: Actor,
  eventId: string,
  status: VerificationStatus,
  opts: { officialSourceUrl?: string | null; notes?: string | null } = {},
) {
  need(admin, "review.verify");
  const ev = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!ev) throw new ServiceError("notFound");
  const source = opts.officialSourceUrl || ev.sourceUrl;
  if (status === "VERIFIED" && (!source || !normalizeUrl(source))) throw new ServiceError("needsEvidence");
  const now = new Date();
  // Evidence trail: what was relied on, plus the automated risk indicators the reviewer saw (advisory context only).
  const lastRisk = (await db.eventSubmission.findFirst({ where: { eventId, riskReport: { not: Prisma.JsonNull } }, orderBy: { submittedAt: "desc" }, select: { riskReport: true } }))?.riskReport as { indicators?: unknown } | null;
  await db.$transaction(async (tx) => {
    await tx.eventVerification.create({
      data: {
        eventId, status, verifiedById: admin.id, officialSourceUrl: source ?? null, notes: opts.notes ?? null,
        method: "MANUAL_REVIEW",
        evidence: (source ? [{ type: "official-source", url: source, checkedAt: now.toISOString() }] : []) as Prisma.InputJsonValue,
        riskIndicators: (lastRisk?.indicators ?? []) as Prisma.InputJsonValue,
      },
    });
    await tx.event.update({
      where: { id: eventId },
      data: {
        verificationStatus: status,
        verificationNotes: opts.notes ?? null,
        ...(status === "VERIFIED" ? { verifiedAt: now, verifiedById: admin.id, lastVerifiedAt: now, sourceUrl: source } : {}),
        ...(status === "UNVERIFIED" ? { verifiedAt: null, verifiedById: null } : {}),
      },
    });
    await audit(admin.id, `event.verification.${status.toLowerCase()}`, "Event", eventId, { source, notes: opts.notes }, tx);
  });
}

export type { Event };
export { slugify };
