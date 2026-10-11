"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { track } from "@/lib/services/misc";

/** Toggle a saved event for the signed-in user. Only published events can be saved. */
export async function toggleSaveAction(eventId: string): Promise<{ saved: boolean } | { error: "auth" | "notFound" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "auth" };
  const event = await db.event.findFirst({ where: { id: eventId, publishState: "PUBLISHED", deletedAt: null }, select: { id: true } });
  if (!event) return { error: "notFound" };
  const key = { userId_eventId: { userId: user.id, eventId } };
  const existing = await db.savedEvent.findUnique({ where: key });
  if (existing) {
    await db.savedEvent.delete({ where: key });
  } else {
    await db.savedEvent.create({ data: { userId: user.id, eventId } });
    await track("SAVE", { eventId });
  }
  revalidatePath("/dashboard", "layout");
  return { saved: !existing };
}

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { zodFieldErrors } from "@/lib/action-result";
import { saveImage, UploadError } from "@/lib/storage";
import { optText } from "@/lib/validation/common";

const prefsSchema = z.object({
  categoryIds: z.array(z.string().uuid()).max(30),
  locationSlugs: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(30),
  onlineOnly: z.boolean(),
  deadlineReminders: z.boolean(),
  newEventAlerts: z.boolean(),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
});

export async function savePreferencesAction(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "pages.unauthorizedBody" };
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const { categoryIds, ...prefs } = parsed.data;
  const valid = await db.eventCategory.findMany({ where: { id: { in: categoryIds }, isActive: true }, select: { id: true } });
  await db.$transaction([
    db.userInterest.deleteMany({ where: { userId: user.id } }),
    db.userInterest.createMany({ data: valid.map((c) => ({ userId: user.id, categoryId: c.id })) }),
    db.notificationPreference.upsert({ where: { userId: user.id }, update: prefs, create: { userId: user.id, unsubscribeToken: crypto.randomUUID().replace(/-/g, ""), ...prefs } }),
  ]);
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "dashboard.saved_ok" };
}

const profileSchema = z.object({
  displayName: optText(80), city: optText(80), locationId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  university: optText(120), educationLevel: z.enum(["HIGH_SCHOOL", "UNDERGRAD", "GRADUATE", "SELF_TAUGHT", "PROFESSIONAL"]).optional().or(z.literal("").transform(() => undefined)),
  skills: optText(300), bio: optText(500),
});

export async function saveProfileAction(fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "pages.unauthorizedBody" };
  const parsed = profileSchema.safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  let imageUrl: string | undefined;
  try {
    const img = fd.get("image");
    if (img instanceof File && img.size > 0) imageUrl = await saveImage(img);
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: "validation.image" };
    throw e;
  }
  const d = parsed.data;
  const data = {
    displayName: d.displayName ?? null, city: d.city ?? null, locationId: d.locationId ?? null, university: d.university ?? null,
    educationLevel: d.educationLevel ?? null, bio: d.bio ?? null,
    skills: (d.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30),
    hideUniversity: fd.get("hideUniversity") === "on", hideSkills: fd.get("hideSkills") === "on", hideBio: fd.get("hideBio") === "on",
    ...(imageUrl ? { imageUrl } : {}),
  };
  await db.userProfile.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
  // The display name is what organizers, the header and notifications show: keep the account name in step with it.
  if (d.displayName) await db.user.update({ where: { id: user.id }, data: { name: d.displayName } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "dashboard.saved_ok" };
}

export async function markNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/dashboard", "layout");
}
