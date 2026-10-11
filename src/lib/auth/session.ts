import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "../password";
import { isPrivileged } from "./permissions";

export const SESSION_COOKIE = "lte_session";
/** Bounded lifetimes: a session dies after 30 days in total or 7 days without use. */
export const ABSOLUTE_DAYS = 30;
export const IDLE_DAYS = 7;
const TOUCH_AFTER_MS = 5 * 60_000;

async function setCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function createSession(userId: string, userAgent?: string | null, opts: { mfaVerified?: boolean } = {}) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ABSOLUTE_DAYS * 86_400_000);
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200), mfaVerifiedAt: opts.mfaVerified ? new Date() : null } });
  await setCookie(token, expiresAt);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Replace the current session token (used when privilege changes, e.g. after passing MFA) so a pre-MFA token can't be reused. */
export async function rotateSession(opts: { mfaVerified: boolean }) {
  const jar = await cookies();
  const old = jar.get(SESSION_COOKIE)?.value;
  const cur = old ? await db.session.findUnique({ where: { tokenHash: sha256(old) } }) : null;
  if (!cur) return;
  const token = randomToken();
  await db.$transaction([
    db.session.delete({ where: { id: cur.id } }),
    db.session.create({ data: { tokenHash: sha256(token), userId: cur.userId, expiresAt: cur.expiresAt, userAgent: cur.userAgent, mfaVerifiedAt: opts.mfaVerified ? new Date() : cur.mfaVerifiedAt } }),
  ]);
  await setCookie(token, cur.expiresAt);
}

/** Sign out everywhere (optionally keeping the current device). */
export async function revokeSessions(userId: string, keepCurrent = false) {
  const token = keepCurrent ? (await cookies()).get(SESSION_COOKIE)?.value : undefined;
  await db.session.deleteMany({ where: { userId, ...(token ? { NOT: { tokenHash: sha256(token) } } : {}) } });
}

export interface SessionUser {
  id: string; email: string; name: string; role: Role; emailVerified: boolean; locale: string;
  /** Fully authenticated: password + (when required) second factor. */
  mfaVerified: boolean; sessionTokenHash: string;
}

async function loadSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const s = await db.session.findUnique({ where: { tokenHash }, include: { user: { include: { mfa: { select: { enabledAt: true } } } } } });
  if (!s) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > IDLE_DAYS * 86_400_000) {
    await db.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  const u = s.user;
  if (u.status !== "ACTIVE" || u.deletedAt) return null;
  if (now - s.lastSeenAt.getTime() > TOUCH_AFTER_MS) await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  const needsMfa = isPrivileged(u.role) || !!u.mfa?.enabledAt;
  return { id: u.id, email: u.email, name: u.name, role: u.role, emailVerified: !!u.emailVerified, locale: u.locale, mfaVerified: !needsMfa || !!s.mfaVerifiedAt, sessionTokenHash: tokenHash };
}

const cachedSession = cache(loadSession);

/** The signed-in user, or null. A session that still owes a second factor is NOT treated as signed in. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const u = await cachedSession();
  return u && u.mfaVerified ? u : null;
});

/** Password-authenticated but second factor still pending (only the MFA pages use this). */
export async function getPendingMfaUser(): Promise<SessionUser | null> {
  const u = await cachedSession();
  return u && !u.mfaVerified ? u : null;
}
