"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { ForbiddenError, assertPermission } from "@/lib/auth/guards";
import { canAssignRole, canModerateUser, isPrivileged, type Permission } from "@/lib/auth/permissions";
import { revokeSessionsFor } from "@/lib/services/sessions";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { normalizeUrl } from "@/lib/url";
import { slugify, uniqueSlug } from "@/lib/slug";
import { currentRequestId } from "@/lib/security/request";
import { recordSecurityEvent } from "@/lib/security/events";
import { promoteCandidate, rejectCandidate } from "@/lib/services/candidates";
import { ServiceError, reviewSubmission, setFeatured, setPublishState, setVerification, softDeleteEvent } from "@/lib/services/events";
import { setSwitch } from "@/lib/services/switches";
import { optText, text } from "@/lib/validation/common";
import { eventFormSchema } from "@/lib/validation/event";

const categorySchema = z.object({ id: z.string().uuid().optional(), nameEn: text(80), nameMy: text(120), icon: text(30), slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "validation.slug").optional() });
const sourceSchema = z.object({
  name: text(120), url: z.string().url("validation.url").refine((u) => /^https?:/.test(u), "validation.url"),
  type: z.enum(["OFFICIAL_WEBSITE", "PUBLIC_API", "RSS_FEED", "MANUAL_SUBMISSION", "COMMUNITY_SUBMISSION", "AUTHORIZED_AUTOMATION"]),
  organization: optText(160), reliabilityNotes: optText(1000),
});
const promoteSchema = z.object({ organizerId: z.string().uuid() });
const VERIFY_METHODS = ["ORG_DOMAIN_EMAIL", "OFFICIAL_WEBSITE", "INDEPENDENT_CONTACT", "SOCIAL_ACCOUNT", "MANUAL_ADMIN"] as const;

type Actor = Awaited<ReturnType<typeof assertPermission>>;

/**
 * Every admin action: (1) authenticates and checks the permission on the SERVER (the page that rendered the button is
 * never trusted), (2) records denials, (3) maps domain errors to safe messages. Deny by default.
 */
async function run(permission: Permission, fn: (admin: Actor) => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const admin = await assertPermission(permission);
    const r = await fn(admin);
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
    return r ?? { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "pages.forbiddenBody" };
    if (e instanceof ServiceError) {
      const map: Record<string, string> = { needsEvidence: "admin.needsEvidence", forbidden: "pages.forbiddenBody", needsAcknowledgement: "admin.needsAcknowledgement" };
      return { ok: false, error: map[e.code] ?? "common.error" };
    }
    throw e;
  }
}

export async function reviewSubmissionAction(id: string, decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED", notes?: string): Promise<ActionResult> {
  return run("review.submissions", async (a) => {
    if (decision !== "APPROVED" && !notes?.trim()) return { ok: false, error: "validation.required" };
    await reviewSubmission(a, id, decision, notes?.trim() || undefined);
  });
}

export async function eventOpAction(eventId: string, op: "publish" | "unpublish" | "archive" | "delete" | "feature" | "unfeature"): Promise<ActionResult> {
  return run("events.manage", async (a) => {
    if (op === "publish") await setPublishState(a, eventId, "PUBLISHED");
    else if (op === "unpublish") await setPublishState(a, eventId, "DRAFT");
    else if (op === "archive") await setPublishState(a, eventId, "ARCHIVED");
    else if (op === "delete") await softDeleteEvent(a, eventId);
    else await setFeatured(a, eventId, op === "feature");
  });
}

export async function verifyEventAction(eventId: string, status: "UNVERIFIED" | "PENDING_VERIFICATION" | "VERIFIED" | "NEEDS_REVIEW", sourceUrl?: string, notes?: string): Promise<ActionResult> {
  return run("review.verify", async (a) => {
    if (sourceUrl && !normalizeUrl(sourceUrl)) return { ok: false, error: "validation.url" };
    await setVerification(a, eventId, status, { officialSourceUrl: sourceUrl || null, notes: notes || null });
  });
}

export async function applicationDecisionAction(id: string, decision: "APPROVED" | "REJECTED", notes?: string): Promise<ActionResult> {
  return run("organizers.manage", async (a) => {
    const app = await db.organizerApplication.findUnique({ where: { id }, include: { user: true } });
    if (!app || app.status !== "PENDING") return { ok: false, error: "common.error" };
    if (decision === "REJECTED" && !notes?.trim()) return { ok: false, error: "validation.required" };
    if (decision === "APPROVED" && !app.user.emailVerified) return { ok: false, error: "admin.emailNotVerified" };
    await db.$transaction(async (tx) => {
      let organizerId: string | null = null;
      if (decision === "APPROVED") {
        const slug = await uniqueSlug(app.name, async (s) => !!(await tx.organizer.findUnique({ where: { slug: s } })));
        // Approval grants *access*; it does NOT verify the organization (that is a separate, evidence-based admin step).
        const org = await tx.organizer.create({ data: { slug, name: app.name, type: app.type, description: app.description, website: app.website, contactEmail: app.contactEmail, status: "UNVERIFIED", members: { create: { userId: app.userId, role: "OWNER" } } } });
        organizerId = org.id;
        if (app.user.role === "STUDENT") await tx.user.update({ where: { id: app.userId }, data: { role: "ORGANIZER" } });
      }
      await tx.organizerApplication.update({ where: { id }, data: { status: decision, reviewNotes: notes, reviewedById: a.id, reviewedAt: new Date(), organizerId } });
      await audit(a.id, `organizer.application.${decision.toLowerCase()}`, "OrganizerApplication", id, { organizerId }, tx);
    });
    if (decision === "APPROVED") await revokeSessionsFor(app.userId); // privilege changed: force fresh sessions
  });
}

/** Grants the Verified Organizer badge. Requires a recorded method and written evidence; admins only; revocable. */
export async function verifyOrganizerAction(id: string, method: string, evidence: string, notes?: string): Promise<ActionResult> {
  return run("organizers.manage", async (a) => {
    if (!(VERIFY_METHODS as readonly string[]).includes(method) || evidence.trim().length < 10) return { ok: false, error: "admin.needsEvidence" };
    const org = await db.organizer.findFirst({ where: { id, deletedAt: null } });
    if (!org || org.status === "SUSPENDED") return { ok: false, error: "common.error" };
    await db.organizer.update({ where: { id }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: a.id, verificationMethod: method, verificationEvidence: evidence.trim().slice(0, 1000) } });
    await audit(a.id, "organizer.verify", "Organizer", id, { method, evidence: evidence.trim().slice(0, 300), notes });
    await recordSecurityEvent({ type: "organizer.verified", severity: "MEDIUM", actorId: a.id, resourceType: "Organizer", resourceId: id, metadata: { method } });
  });
}

export async function organizerOpAction(id: string, op: "revoke" | "suspend" | "reinstate", reason?: string): Promise<ActionResult> {
  return run("organizers.manage", async (a) => {
    if ((op === "revoke" || op === "suspend") && !(reason && reason.trim().length >= 5)) return { ok: false, error: "validation.required" };
    const data = {
      revoke: { status: "UNVERIFIED" as const, verifiedAt: null, verifiedById: null, verificationMethod: null, verificationEvidence: null },
      suspend: { status: "SUSPENDED" as const, verifiedAt: null }, reinstate: { status: "UNVERIFIED" as const },
    }[op];
    await db.organizer.update({ where: { id }, data });
    await audit(a.id, `organizer.${op}`, "Organizer", id, { reason });
    await recordSecurityEvent({ type: `organizer.${op}`, severity: op === "suspend" ? "MEDIUM" : "LOW", actorId: a.id, resourceType: "Organizer", resourceId: id });
  });
}

export async function userOpAction(id: string, op: "suspend" | "reinstate" | "STUDENT" | "ORGANIZER" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN"): Promise<ActionResult> {
  return run("users.manage", async (a) => {
    const target = await db.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) return { ok: false, error: "common.error" };
    const requestId = await currentRequestId();
    if (op === "suspend" || op === "reinstate") {
      if (!canModerateUser(a, target)) {
        await recordSecurityEvent({ type: "authz.privilege_escalation_blocked", severity: "HIGH", outcome: "blocked", actorId: a.id, requestId, resourceType: "User", resourceId: id, metadata: { op } });
        return { ok: false, error: id === a.id ? "admin.selfChange" : "pages.forbiddenBody" };
      }
      await db.user.update({ where: { id }, data: { status: op === "suspend" ? "SUSPENDED" : "ACTIVE" } });
      if (op === "suspend") await revokeSessionsFor(id);
    } else {
      if (!canAssignRole(a, target, op)) {
        await recordSecurityEvent({ type: "authz.privilege_escalation_blocked", severity: "HIGH", outcome: "blocked", actorId: a.id, requestId, resourceType: "User", resourceId: id, metadata: { from: target.role, to: op } });
        return { ok: false, error: id === a.id ? "admin.selfChange" : "pages.forbiddenBody" };
      }
      await db.user.update({ where: { id }, data: { role: op } });
      await revokeSessionsFor(id); // privilege change → old sessions can't carry the old (or new) authority
      await recordSecurityEvent({ type: "role.changed", severity: isPrivileged(op) ? (op === "MODERATOR" ? "MEDIUM" : "CRITICAL") : "LOW", actorId: a.id, requestId, resourceType: "User", resourceId: id, metadata: { from: target.role, to: op } });
    }
    await audit(a.id, `user.${op}`, "User", id, { from: target.role });
  });
}

export async function saveCategoryAction(input: unknown): Promise<ActionResult> {
  return run("categories.manage", async (a) => {
    const p = categorySchema.safeParse(input);
    if (!p.success) return { ok: false, fieldErrors: zodFieldErrors(p.error) };
    const { id, ...d } = p.data;
    if (id) {
      await db.eventCategory.update({ where: { id }, data: { nameEn: d.nameEn, nameMy: d.nameMy, icon: d.icon } });
    } else {
      const slug = d.slug ?? slugify(d.nameEn);
      if (await db.eventCategory.findUnique({ where: { slug } })) return { ok: false, error: "admin.exists" };
      const max = await db.eventCategory.aggregate({ _max: { sortOrder: true } });
      await db.eventCategory.create({ data: { slug, nameEn: d.nameEn, nameMy: d.nameMy, icon: d.icon, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    }
    await audit(a.id, id ? "category.update" : "category.create", "EventCategory", id ?? null, d);
    revalidateTag("categories", "max");
  });
}

export async function categoryOpAction(id: string, op: "activate" | "deactivate" | "up" | "down"): Promise<ActionResult> {
  return run("categories.manage", async (a) => {
    if (op === "activate" || op === "deactivate") {
      await db.eventCategory.update({ where: { id }, data: { isActive: op === "activate" } });
    } else {
      const all = await db.eventCategory.findMany({ orderBy: { sortOrder: "asc" } });
      const i = all.findIndex((c) => c.id === id);
      const j = op === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= all.length) return;
      await db.$transaction([
        db.eventCategory.update({ where: { id: all[i].id }, data: { sortOrder: all[j].sortOrder } }),
        db.eventCategory.update({ where: { id: all[j].id }, data: { sortOrder: all[i].sortOrder } }),
      ]);
    }
    await audit(a.id, `category.${op}`, "EventCategory", id);
    revalidateTag("categories", "max");
  });
}

export async function reportStatusAction(id: string, status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED", notes?: string): Promise<ActionResult> {
  return run("review.reports", async (a) => {
    await db.eventReport.update({ where: { id }, data: { status, resolutionNotes: notes || undefined, resolvedById: status === "RESOLVED" || status === "DISMISSED" ? a.id : null } });
    await audit(a.id, `report.${status.toLowerCase()}`, "EventReport", id, { notes });
  });
}

export async function createSourceAction(input: unknown): Promise<ActionResult> {
  return run("sources.manage", async (a) => {
    const p = sourceSchema.safeParse(input);
    if (!p.success) return { ok: false, fieldErrors: zodFieldErrors(p.error) };
    const normalizedUrl = normalizeUrl(p.data.url)!;
    if (await db.eventSource.findUnique({ where: { normalizedUrl } })) return { ok: false, error: "admin.exists" };
    const s = await db.eventSource.create({ data: { ...p.data, normalizedUrl } });
    await audit(a.id, "source.create", "EventSource", s.id, { url: p.data.url });
  });
}

export async function sourceOpAction(id: string, op: "pause" | "resume" | "delete"): Promise<ActionResult> {
  return run("sources.manage", async (a) => {
    if (op === "delete") await db.eventSource.delete({ where: { id } });
    else await db.eventSource.update({ where: { id }, data: { status: op === "pause" ? "PAUSED" : "ACTIVE", consecutiveFailures: 0 } });
    await audit(a.id, `source.${op}`, "EventSource", id);
  });
}

export async function candidateRejectAction(id: string, notes: string | undefined, duplicate: boolean): Promise<ActionResult> {
  return run("review.candidates", async (a) => { await rejectCandidate(a, id, notes, duplicate); });
}

export async function candidatePromoteAction(id: string, organizerId: string, fields: unknown): Promise<ActionResult> {
  return run("review.candidates", async (a) => {
    const o = promoteSchema.safeParse({ organizerId });
    const f = eventFormSchema.safeParse(fields);
    if (!o.success) return { ok: false, error: "validation.required" };
    if (!f.success) return { ok: false, fieldErrors: zodFieldErrors(f.error) };
    await promoteCandidate(a, id, { ...f.data, organizerId: o.data.organizerId });
  });
}

/** Incident-response switches: pause automation / disable submissions. Reversible, audited, ADMIN and above. */
export async function killSwitchAction(key: "automation_paused" | "submissions_disabled", on: boolean): Promise<ActionResult> {
  return run("security.emergency", async (a) => {
    await setSwitch(key, on);
    await audit(a.id, `switch.${key}.${on ? "on" : "off"}`, "SiteSetting", key);
    await recordSecurityEvent({ type: `switch.${key}`, severity: "HIGH", actorId: a.id, resourceType: "SiteSetting", resourceId: key, metadata: { on } });
  });
}

export async function ackAlertAction(id: string): Promise<ActionResult> {
  return run("security.view", async (a) => {
    await db.securityAlert.update({ where: { id }, data: { status: "ACKNOWLEDGED", ackedById: a.id } });
    await audit(a.id, "alert.ack", "SecurityAlert", id);
  });
}
