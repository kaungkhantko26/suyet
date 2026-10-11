"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import type { ActionResult } from "@/lib/action-result";
import { getCurrentUser, getPendingMfaUser, revokeSessions, rotateSession, destroySession } from "@/lib/auth/session";
import { isPrivileged } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clientIp, isLimited, rateLimit, resetLimit } from "@/lib/rate-limit";
import { currentRequestId } from "@/lib/security/request";
import { recordSecurityEvent } from "@/lib/security/events";
import { otpauthUri, decryptSecret } from "@/lib/security/totp";
import { beginEnrollment, confirmEnrollment, disableMfa, verifySecondFactor } from "@/lib/services/mfa";
import { deleteAccount } from "@/lib/services/account";
import { safeRedirectPath } from "@/lib/url";

const ctx = async () => ({ ip: clientIp(await headers()), requestId: await currentRequestId() });
/** Either a fully signed-in user (voluntary MFA) or a password-authenticated user who still owes enrollment/verification. */
const actor = async () => (await getCurrentUser()) ?? (await getPendingMfaUser());

export async function startMfaSetupAction(): Promise<ActionResult & { data?: { secret: string; qr: string } }> {
  const u = await actor();
  if (!u) return { ok: false, error: "pages.unauthorizedBody" };
  const rl = await rateLimit(`mfa-setup:${u.id}`, 10, 3600);
  if (!rl.allowed) return { ok: false, error: "auth.tooMany" };
  const secret = await beginEnrollment(u.id);
  const qr = await QRCode.toString(otpauthUri(secret, u.email), { type: "svg", margin: 1, width: 192 });
  return { ok: true, data: { secret, qr } };
}

/** Confirms the first code; returns recovery codes ONCE. The session token is rotated and marked MFA-verified. */
export async function confirmMfaSetupAction(code: string): Promise<ActionResult & { data?: { recoveryCodes: string[] } }> {
  const u = await actor();
  if (!u) return { ok: false, error: "pages.unauthorizedBody" };
  const rl = await rateLimit(`mfa:${u.id}`, 5, 300);
  if (!rl.allowed) return { ok: false, error: "auth.tooMany" };
  const codes = await confirmEnrollment(u.id, String(code).trim(), await ctx());
  if (!codes) return { ok: false, error: "mfa.invalid" };
  await rotateSession({ mfaVerified: true });
  return { ok: true, data: { recoveryCodes: codes } };
}

export async function verifyMfaAction(code: string, next?: string): Promise<ActionResult> {
  const u = await getPendingMfaUser();
  if (!u) return { ok: false, error: "pages.unauthorizedBody" };
  const r = await verifySecondFactor(u.id, String(code), await ctx());
  if (r === "limited") return { ok: false, error: "auth.tooMany" };
  if (r !== "ok") return { ok: false, error: "mfa.invalid" };
  await rotateSession({ mfaVerified: true }); // new token after the privilege change
  return { ok: true, redirect: safeRedirectPath(next) };
}

/** Voluntary MFA can be removed after re-entering the password. Privileged roles cannot remove it. */
export async function disableMfaAction(password: string): Promise<ActionResult> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "pages.unauthorizedBody" };
  if (isPrivileged(u.role)) return { ok: false, error: "mfa.required" };
  const row = await db.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(password, row?.passwordHash ?? null))) return { ok: false, error: "auth.invalidCreds" };
  await disableMfa(u.id, u.id);
  return { ok: true };
}

export async function signOutEverywhereAction(): Promise<void> {
  const u = await getCurrentUser();
  if (!u) redirect("/auth/login");
  await revokeSessions(u.id);
  await recordSecurityEvent({ type: "auth.logout_all", actorId: u.id, resourceType: "User", resourceId: u.id });
  await destroySession();
  redirect("/auth/login");
}

export async function deleteAccountAction(password: string): Promise<ActionResult> {
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: "pages.unauthorizedBody" };
  const c = await ctx();
  if ((await isLimited(`delete:${u.id}`, 5)).limited) return { ok: false, error: "auth.tooMany" };
  const row = await db.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(password, row?.passwordHash ?? null))) {
    await rateLimit(`delete:${u.id}`, 5, 900);
    return { ok: false, error: "auth.invalidCreds" };
  }
  await resetLimit(`delete:${u.id}`);
  const r = await deleteAccount(u.id, c);
  if (r === "staff-account") return { ok: false, error: "securityPage.staffCannotDelete" };
  await destroySession();
  return { ok: true, redirect: "/?deleted=1" };
}

export async function hasPendingSecret(): Promise<boolean> {
  const u = await actor();
  if (!u) return false;
  const c = await db.mfaCredential.findUnique({ where: { userId: u.id } });
  if (!c) return false;
  try { decryptSecret(c.secretEnc); return true; } catch { return false; }
}
