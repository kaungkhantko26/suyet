import { Prisma } from "@prisma/client";
import { config } from "../config";
import { db } from "../db";
import { fromDateTimeLocal, toDateTimeLocal } from "../dates";
import { computeEventStatus } from "../event-status";
import { effectiveRegistrationUrl } from "../events/registration-helpers";
import { rateLimit } from "../rate-limit";
import { recordSecurityEvent } from "../security/events";
import { audit } from "../audit";
import { createNotification } from "./notifications";
import { type Answer, type FieldDef, type FormInput, toCsv, validateAnswers } from "../registration/schema";
import { can } from "../auth/permissions";
import { ServiceError, assertCanManage } from "./events";

/** Statuses that hold a seat. */
export const ACTIVE = ["SUBMITTED", "APPROVED"] as const;

export type RegResult = { ok: true; registrationId: string; message: string | null; status: "SUBMITTED" | "APPROVED" } | { ok: false; error: "notFound" | "closed" | "full" | "already" | "rejected" | "unverified" | "tooMany" | "invalid"; fieldErrors?: Record<string, string> };

const asDef = (f: { id: string; type: string; label: string; helpText: string | null; required: boolean; options: unknown; rules: unknown }): FieldDef & { id: string } => ({
  id: f.id, type: f.type as FieldDef["type"], label: f.label, helpText: f.helpText, required: f.required,
  options: (f.options as string[] | null) ?? null, rules: (f.rules as FieldDef["rules"]) ?? null,
});

export async function loadForm(eventId: string) {
  const form = await db.registrationForm.findUnique({ where: { eventId }, include: { fields: { orderBy: { position: "asc" } } } });
  return form;
}

/** Organizer builder → persists settings and fields atomically. Existing field ids are kept so history stays linked. */
export async function saveForm(actor: { id: string; role: import("@prisma/client").Role }, eventId: string, input: FormInput) {
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw new ServiceError("notFound");
  await assertCanManage(actor, event.organizerId); // object-level ownership
  if (event.registrationMode !== "ON_PLATFORM") throw new ServiceError("invalidState", "event does not use on-site registration");
  const closesAt = input.closesAt ? fromDateTimeLocal(input.closesAt) : null;
  await db.$transaction(async (tx) => {
    const form = await tx.registrationForm.upsert({
      where: { eventId },
      update: { enabled: input.enabled, requireApproval: input.requireApproval, description: input.description, confirmationMessage: input.confirmationMessage, capacity: input.capacity, closesAt },
      create: { eventId, enabled: input.enabled, requireApproval: input.requireApproval, description: input.description, confirmationMessage: input.confirmationMessage, capacity: input.capacity, closesAt },
    });
    const existing = await tx.registrationField.findMany({ where: { formId: form.id }, select: { id: true } });
    const own = new Set(existing.map((f) => f.id));
    const keep = input.fields.map((f) => f.id).filter((id): id is string => !!id && own.has(id));
    await tx.registrationField.deleteMany({ where: { formId: form.id, id: { notIn: keep } } });
    for (const [position, f] of input.fields.entries()) {
      const data = { position, type: f.type, label: f.label, helpText: f.helpText, required: f.required, options: (f.options ?? Prisma.JsonNull) as Prisma.InputJsonValue, rules: (f.rules ?? Prisma.JsonNull) as Prisma.InputJsonValue };
      if (f.id && own.has(f.id)) await tx.registrationField.update({ where: { id: f.id }, data });
      else await tx.registrationField.create({ data: { ...data, formId: form.id } });
    }
  });
  await recordSecurityEvent({ type: "registration.form_saved", actorId: actor.id, resourceType: "Event", resourceId: eventId });
}

export function formToInput(form: Awaited<ReturnType<typeof loadForm>>) {
  return {
    enabled: form?.enabled ?? false, requireApproval: form?.requireApproval ?? false, description: form?.description ?? "", confirmationMessage: form?.confirmationMessage ?? "",
    capacity: form?.capacity ?? null, closesAt: toDateTimeLocal(form?.closesAt),
    fields: (form?.fields ?? []).map((f) => ({ id: f.id, type: f.type, label: f.label, helpText: f.helpText ?? "", required: f.required, options: (f.options as string[] | null) ?? [], rules: (f.rules as FieldDef["rules"]) ?? null })),
  };
}

export async function activeCount(eventId: string) {
  return db.registration.count({ where: { eventId, status: { in: [...ACTIVE] } } });
}

/**
 * Participant registration. Everything is decided on the server from stored data: event state, deadline, form window,
 * capacity (serialised per event with an advisory lock so the last seat cannot be double-booked), one registration per
 * user, verified email, and validation of answers against the saved form definition.
 */
export async function submitRegistration(user: { id: string; emailVerified: boolean }, eventSlug: string, rawAnswers: Record<string, unknown>, now = new Date()): Promise<RegResult> {
  const event = await db.event.findFirst({
    where: { slug: eventSlug, publishState: "PUBLISHED", deletedAt: null },
    include: { registrationForm: { include: { fields: { orderBy: { position: "asc" } } } } },
  });
  if (!event || event.registrationMode !== "ON_PLATFORM" || !event.registrationForm) return { ok: false, error: "notFound" };
  const form = event.registrationForm;
  if (!user.emailVerified) return { ok: false, error: "unverified" };
  const rl = await rateLimit(`register-event:${user.id}`, 10, 3600);
  if (!rl.allowed) return { ok: false, error: "tooMany" };

  const open = computeEventStatus({ ...event, registrationUrl: effectiveRegistrationUrl({ ...event, registrationForm: form }) }, now) === "REGISTRATION_OPEN" && (!form.closesAt || now < form.closesAt);
  if (!open) return { ok: false, error: "closed" };

  const checked = validateAnswers(form.fields.map(asDef), rawAnswers);
  if (!checked.ok) return { ok: false, error: "invalid", fieldErrors: checked.errors };

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.id}))`;
    const existing = await tx.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.id } } });
    if (existing && ACTIVE.includes(existing.status as (typeof ACTIVE)[number])) return { ok: false as const, error: "already" as const };
    if (existing?.status === "REJECTED") return { ok: false as const, error: "rejected" as const }; // the organizer's decision stands
    if (form.capacity !== null) {
      const taken = await tx.registration.count({ where: { eventId: event.id, status: { in: [...ACTIVE] } } });
      if (taken >= form.capacity) return { ok: false as const, error: "full" as const };
    }
    // Without manual review the participant is accepted immediately; with it, the registration waits for the organizer.
    const status = form.requireApproval ? ("SUBMITTED" as const) : ("APPROVED" as const);
    const data = { formId: form.id, status, answers: checked.answers as unknown as Prisma.InputJsonValue, consentAt: now, decidedAt: null, decidedById: null, decisionNote: null };
    const reg = existing
      ? await tx.registration.update({ where: { id: existing.id }, data })
      : await tx.registration.create({ data: { ...data, eventId: event.id, userId: user.id } });
    await tx.job.create({ data: { type: "email", payload: await confirmationEmail(tx, user.id, event.title, event.slug, form.requireApproval) as Prisma.InputJsonValue, dedupeKey: `reg-confirm:${reg.id}:${now.getTime()}` } });
    return { ok: true as const, registrationId: reg.id, message: form.confirmationMessage, status };
  });
}

async function confirmationEmail(tx: Prisma.TransactionClient, userId: string, title: string, slug: string, pending: boolean) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } });
  return {
    to: u.email,
    subject: pending ? `Registration received: ${title}` : `You're registered: ${title}`,
    text: pending
      ? `Hi ${u.name},\n\nYour registration for "${title}" was received. The organizer reviews registrations and you will get a notification with their decision.\n${config.appUrl}/dashboard/registrations`
      : `Hi ${u.name},\n\nYou are registered for "${title}".\n${config.appUrl}/events/${slug}\n\nYou can withdraw it any time from your dashboard (Registrations).`,
  };
}

export async function withdrawRegistration(userId: string, eventId: string) {
  const r = await db.registration.updateMany({ where: { eventId, userId, status: { in: [...ACTIVE] } }, data: { status: "WITHDRAWN" } });
  return r.count === 1;
}

export async function myRegistrations(userId: string) {
  return db.registration.findMany({
    where: { userId }, orderBy: { createdAt: "desc" },
    include: { event: { select: { slug: true, title: true, startAt: true, cancelled: true, organizer: { select: { name: true } } } } },
  });
}

/** Organizer view of responses. Ownership is enforced here, not in the page. */
export async function listRegistrations(actor: { id: string; role: import("@prisma/client").Role }, eventId: string) {
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true, organizerId: true, title: true, slug: true } });
  if (!event) throw new ServiceError("notFound");
  await assertCanManage(actor, event.organizerId);
  const rows = await db.registration.findMany({ where: { eventId }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, email: true } } } });
  return { event, rows };
}

export async function exportRegistrationsCsv(actor: { id: string; role: import("@prisma/client").Role }, eventId: string, ip?: string) {
  const { event, rows } = await listRegistrations(actor, eventId);
  const form = await loadForm(eventId);
  const questions = (form?.fields ?? []).map((f) => ({ id: f.id, label: f.label }));
  const head = ["Registered at (UTC)", "Status", "Decision note", "Name", "Email", ...questions.map((q) => q.label)];
  const body = rows.map((r) => {
    const byId = new Map((r.answers as unknown as Answer[]).map((a) => [a.fieldId, a.value]));
    return [r.createdAt.toISOString(), r.status, r.decisionNote ?? "", r.user.name, r.user.email, ...questions.map((q) => byId.get(q.id) ?? "")];
  });
  await recordSecurityEvent({ type: "registrations.exported", severity: "LOW", actorId: actor.id, ip, resourceType: "Event", resourceId: eventId, metadata: { rows: rows.length } });
  return { filename: `${event.slug}-registrations.csv`, csv: toCsv([head, ...body]) };
}

/**
 * Organizer decision on a registration. Ownership is enforced here; the participant is notified in-app and by email
 * (decisions are transactional, so the email is sent regardless of marketing preferences). Re-deciding is allowed
 * (e.g. approve → reject) and is audited; withdrawn registrations cannot be decided.
 */
export async function decideRegistration(
  actor: { id: string; role: import("@prisma/client").Role },
  registrationId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string | null,
) {
  const reg = await db.registration.findUnique({
    where: { id: registrationId },
    include: { event: { select: { id: true, title: true, slug: true, organizerId: true } }, user: { select: { id: true, email: true, locale: true } } },
  });
  if (!reg) throw new ServiceError("notFound");
  await assertCanManage(actor, reg.event.organizerId);
  if (reg.status === "WITHDRAWN") throw new ServiceError("invalidState", "registration was withdrawn");
  const cleanNote = note?.trim().slice(0, 500) || null;
  if (decision === "REJECTED" && !cleanNote) throw new ServiceError("invalidState", "a short reason is required");
  const changed = reg.status !== decision;
  await db.registration.update({ where: { id: reg.id }, data: { status: decision, decidedAt: new Date(), decidedById: actor.id, decisionNote: cleanNote } });
  if (changed) {
    await createNotification(
      { userId: reg.user.id, email: reg.user.email, locale: reg.user.locale, emailEnabled: true, inAppEnabled: true },
      decision === "APPROVED" ? "REGISTRATION_APPROVED" : "REGISTRATION_REJECTED",
      reg.event,
      `${reg.id}:${decision}:${Date.now()}`,
    );
  }
  await recordSecurityEvent({ type: "registration.decided", actorId: actor.id, resourceType: "Registration", resourceId: reg.id, metadata: { decision, eventId: reg.event.id } });
  if (can(actor.role, "events.manage")) await audit(actor.id, `registration.${decision.toLowerCase()}`, "Registration", reg.id, { eventId: reg.event.id });
  return { id: reg.id, status: decision };
}

export async function registrationCounts(eventId: string) {
  const g = await db.registration.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } });
  const c = Object.fromEntries(g.map((x) => [x.status, x._count._all])) as Partial<Record<string, number>>;
  return { pending: c.SUBMITTED ?? 0, approved: c.APPROVED ?? 0, rejected: c.REJECTED ?? 0, withdrawn: c.WITHDRAWN ?? 0 };
}
