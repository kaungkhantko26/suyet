"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ForbiddenError, assertPermission } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { formSchema } from "@/lib/registration/schema";
import { ServiceError } from "@/lib/services/events";
import { decideRegistration, saveForm, submitRegistration, withdrawRegistration } from "@/lib/services/registrations";

/** Organizer: save the registration form for an event they manage (ownership re-checked in the service). */
export async function saveRegistrationFormAction(eventId: string, input: unknown): Promise<ActionResult> {
  try {
    const user = await assertPermission("event.edit.own");
    const parsed = formSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message.startsWith("validation.") || i.message.startsWith("registration.") ? i.message : "validation.required";
      return { ok: false, error: Object.values(fieldErrors)[0] ?? "common.error", fieldErrors };
    }
    await saveForm(user, eventId, parsed.data);
    revalidatePath("/organizer", "layout");
    revalidatePath("/events", "layout");
    return { ok: true, message: "form.saved" };
  } catch (e) {
    if (e instanceof ForbiddenError || (e instanceof ServiceError && e.code === "forbidden")) return { ok: false, error: "pages.forbiddenBody" };
    if (e instanceof ServiceError) return { ok: false, error: "registration.notOnPlatform" };
    throw e;
  }
}

/** Participant: submit the registration form. Identity comes from the session, never from the request. */
export async function submitRegistrationAction(slug: string, answers: Record<string, unknown>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "pages.unauthorizedBody" };
  await headers(); // opt in to dynamic request context
  const r = await submitRegistration({ id: user.id, emailVerified: user.emailVerified }, slug, answers && typeof answers === "object" ? answers : {});
  if (!r.ok) {
    const map = { notFound: "common.error", closed: "registration.closed", full: "registration.full", already: "registration.already", rejected: "registration.rejectedFinal", unverified: "auth.verifyBanner", tooMany: "auth.tooMany", invalid: "validation.required" } as const;
    return { ok: false, error: map[r.error], fieldErrors: r.fieldErrors };
  }
  // No revalidatePath here: it would re-render the apply page and replace the confirmation the form is showing.
  return { ok: true, message: r.message ?? "registration.success", data: { status: r.status } };
}

export async function withdrawRegistrationAction(eventId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "pages.unauthorizedBody" };
  const ok = await withdrawRegistration(user.id, eventId);
  revalidatePath("/dashboard", "layout");
  return ok ? { ok: true } : { ok: false, error: "common.error" };
}


/** Organizer: approve or reject a participant. Ownership/permission are re-checked in the service. */
export async function decideRegistrationAction(registrationId: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<ActionResult> {
  try {
    const user = await assertPermission("event.edit.own");
    if (decision !== "APPROVED" && decision !== "REJECTED") return { ok: false, error: "common.error" };
    if (decision === "REJECTED" && !note?.trim()) return { ok: false, error: "registration.reasonRequired" };
    await decideRegistration(user, registrationId, decision, note);
    revalidatePath("/organizer", "layout");
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError || (e instanceof ServiceError && e.code === "forbidden")) return { ok: false, error: "pages.forbiddenBody" };
    if (e instanceof ServiceError) return { ok: false, error: "common.error" };
    throw e;
  }
}
