"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { ForbiddenError, assertPermission, canManageOrganizer } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { saveImage, UploadError } from "@/lib/storage";
import { ServiceError, createEvent, setOverrides, submitForReview, updateEvent } from "@/lib/services/events";
import { emailField, optText, optUrl, text } from "@/lib/validation/common";
import { eventFormSchema } from "@/lib/validation/event";
import { rateLimit } from "@/lib/rate-limit";

function fail(e: unknown): ActionResult {
  if (e instanceof ForbiddenError || (e instanceof ServiceError && e.code === "forbidden")) return { ok: false, error: "pages.forbiddenBody" };
  if (e instanceof UploadError) return { ok: false, error: "validation.image" };
  if (e instanceof ServiceError) return { ok: false, error: e.code === "disabled" ? "pages.submissionsDisabled" : e.code === "rateLimited" ? "auth.tooMany" : "common.error" };
  throw e;
}

const applicationSchema = z.object({
  name: text(160),
  type: z.enum(["UNIVERSITY", "UNIVERSITY_CLUB", "TECH_COMMUNITY", "COMPANY", "NONPROFIT", "INDEPENDENT"]),
  description: text(2000),
  website: optUrl,
  contactEmail: emailField,
  evidenceUrl: optUrl,
});

export async function applyOrganizerAction(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "pages.unauthorizedBody" };
  if (!user.emailVerified) return { ok: false, error: "auth.verifyBanner" };
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const rl = await rateLimit(`apply:${user.id}`, 3, 86_400);
  if (!rl.allowed) return { ok: false, error: "auth.tooMany" };
  const pending = await db.organizerApplication.findFirst({ where: { userId: user.id, status: "PENDING" } });
  if (pending) return { ok: true, message: "submit.applyPending" };
  await db.organizerApplication.create({ data: { ...parsed.data, userId: user.id } });
  revalidatePath("/submit-event");
  return { ok: true, message: "submit.applySent" };
}

/** Create/update an event. FormData: `data` (JSON), optional `banner` file, `intent` = draft|submit, optional `eventId`/`organizerId`. */
export async function saveEventAction(fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertPermission("event.submit");
    let raw: unknown;
    try { raw = JSON.parse(String(fd.get("data") ?? "{}")); } catch { return { ok: false, error: "common.error" }; }
    const parsed = eventFormSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    // Reject unknown/inactive categories with a field error instead of failing on the foreign key.
    const validCats = await db.eventCategory.count({ where: { id: { in: parsed.data.categoryIds }, isActive: true } });
    if (validCats !== new Set(parsed.data.categoryIds).size) return { ok: false, fieldErrors: { categoryIds: "validation.category" } };

    const banner = fd.get("banner");
    const bannerUrl = banner instanceof File && banner.size > 0 ? await saveImage(banner) : undefined;
    const eventId = String(fd.get("eventId") ?? "") || null;
    const intent = fd.get("intent") === "submit" ? "submit" : "draft";

    let id = eventId;
    let queued = false;
    if (eventId) {
      const r = await updateEvent(user, eventId, parsed.data, bannerUrl);
      queued = r.queuedForReview;
    } else {
      const organizerId = String(fd.get("organizerId") ?? "");
      if (!(await canManageOrganizer(user, organizerId))) return { ok: false, error: "pages.forbiddenBody" };
      id = (await createEvent(user, organizerId, parsed.data, bannerUrl)).id;
    }
    if (intent === "submit" && id) {
      const ev = await db.event.findUnique({ where: { id }, select: { publishState: true } });
      if (ev?.publishState !== "PUBLISHED") await submitForReview(user, id);
    }
    revalidatePath("/organizer", "layout");
    return { ok: true, message: queued ? "form.changesQueued" : intent === "submit" ? "form.submitted" : "form.saved", redirect: "/organizer/events" };
  } catch (e) {
    return fail(e);
  }
}

export async function submitEventAction(eventId: string): Promise<ActionResult> {
  try {
    const user = await assertPermission("event.submit");
    await submitForReview(user, eventId);
    revalidatePath("/organizer", "layout");
    return { ok: true, message: "form.submitted" };
  } catch (e) {
    return fail(e);
  }
}

export async function setOverridesAction(eventId: string, o: { cancelled?: boolean; registrationClosedOverride?: boolean }): Promise<ActionResult> {
  try {
    const user = await assertPermission("event.submit");
    await setOverrides(user, eventId, {
      ...(typeof o.cancelled === "boolean" ? { cancelled: o.cancelled } : {}),
      ...(typeof o.registrationClosedOverride === "boolean" ? { registrationClosedOverride: o.registrationClosedOverride } : {}),
    });
    revalidatePath("/organizer", "layout");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const profileSchema = z.object({
  organizerId: z.string().uuid(),
  name: text(160),
  description: optText(2000),
  website: optUrl, facebook: optUrl, telegram: optUrl,
  contactEmail: emailField.optional().or(z.literal("").transform(() => undefined)),
});

export async function updateOrganizerProfileAction(fd: FormData): Promise<ActionResult> {
  try {
    const user = await assertPermission("event.submit");
    const parsed = profileSchema.safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
    const { organizerId, ...data } = parsed.data;
    if (!(await canManageOrganizer(user, organizerId))) return { ok: false, error: "pages.forbiddenBody" };
    const logo = fd.get("logo");
    const logoUrl = logo instanceof File && logo.size > 0 ? await saveImage(logo) : undefined;
    // Verification status is admin-only and deliberately not editable here.
    await db.organizer.update({ where: { id: organizerId }, data: { ...data, ...(logoUrl ? { logoUrl } : {}) } });
    revalidatePath("/organizer", "layout");
    return { ok: true, message: "form.saved" };
  } catch (e) {
    return fail(e);
  }
}

