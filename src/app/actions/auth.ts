"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { zodFieldErrors } from "@/lib/action-result";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { authenticate, registerUser, requestPasswordReset, requiresSecondFactor, resetPassword, sendVerificationEmail } from "@/lib/services/auth";
import { forgotSchema, loginSchema, registerOrganizerSchema, registerSchema, resetSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/url";
import { currentRequestId } from "@/lib/security/request";
import { getLocale } from "@/i18n/server";

const ctx = async () => ({ ip: clientIp(await headers()), requestId: await currentRequestId() });

export async function loginAction(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const c = await ctx();
  const res = await authenticate(parsed.data.email, parsed.data.password, c);
  if (!res.ok) return { ok: false, error: `auth.${res.error === "emailTaken" ? "invalidCreds" : res.error}` };
  const needs = requiresSecondFactor(res.role, res.mfaEnrolled);
  await createSession(res.userId, (await headers()).get("user-agent"), { mfaVerified: !needs });
  const dest = safeRedirectPath(next);
  if (needs) return { ok: true, redirect: `${res.mfaEnrolled ? "/auth/mfa" : "/auth/mfa/setup"}?next=${encodeURIComponent(dest)}` };
  return { ok: true, redirect: dest };
}

export async function registerAction(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const res = await registerUser({ ...parsed.data, locale: await getLocale(), ...(await ctx()) });
  if (!res.ok) return { ok: false, error: `auth.${res.error}` };
  await createSession(res.userId, (await headers()).get("user-agent"), { mfaVerified: true });
  return { ok: true, redirect: "/dashboard?welcome=1" };
}

export async function registerOrganizerAction(input: unknown): Promise<ActionResult> {
  const parsed = registerOrganizerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const { name, email, password, orgName, orgType, orgDescription, orgEmail, orgWebsite, orgEvidence } = parsed.data;
  const res = await registerUser({
    name, email, password, locale: await getLocale(), ...(await ctx()),
    application: { name: orgName, type: orgType, description: orgDescription, contactEmail: orgEmail, website: orgWebsite, evidenceUrl: orgEvidence },
  });
  if (!res.ok) return { ok: false, error: `auth.${res.error}` };
  await createSession(res.userId, (await headers()).get("user-agent"), { mfaVerified: true });
  return { ok: true, redirect: "/dashboard?organizerApplied=1" };
}

export async function forgotAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const c = await ctx();
  await requestPasswordReset(parsed.data.email, c.ip, c.requestId);
  return { ok: true, message: "auth.resetSent" }; // same answer whether or not the account exists
}

export async function resetAction(input: unknown): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
  const r = await resetPassword(parsed.data.token, parsed.data.password, await ctx());
  if (r === "breached") return { ok: false, error: "auth.passwordBreached" };
  return r ? { ok: true, message: "auth.resetDone", redirect: "/auth/login" } : { ok: false, error: "auth.resetInvalid" };
}

export async function resendVerificationAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "common.error" };
  const rl = await rateLimit(`resend:${user.id}`, 3, 3600);
  if (!rl.allowed) return { ok: false, error: "auth.tooMany" };
  await sendVerificationEmail(user.id);
  return { ok: true, message: "auth.resent" };
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
