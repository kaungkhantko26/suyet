import { Prisma, type Role } from "@prisma/client";
import { config } from "../config";
import { db } from "../db";
import { isPrivileged } from "../auth/permissions";
import { enqueue } from "../jobs";
import { hashPassword, needsRehash, randomToken, sha256, verifyPassword } from "../password";
import { isLimited, rateLimit, resetLimit } from "../rate-limit";
import { recordSecurityEvent } from "../security/events";
import { checkPassword } from "../security/pwned";
import { revokeSessionsFor } from "./sessions";

export type AuthError = "invalidCreds" | "emailTaken" | "tooMany" | "suspended" | "invalidToken" | "passwordBreached";
export type AuthResult<T = object> = ({ ok: true } & T) | { ok: false; error: AuthError };
interface Ctx { ip: string; requestId?: string }

const HOUR = 3_600_000;

async function issueToken(identifier: string, type: "VERIFY_EMAIL" | "RESET_PASSWORD", ttlMs: number) {
  const token = randomToken();
  await db.verificationToken.deleteMany({ where: { identifier, type } });
  await db.verificationToken.create({ data: { identifier, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.emailVerified) return;
  const token = await issueToken(user.email, "VERIFY_EMAIL", 48 * HOUR);
  const link = `${config.appUrl}/auth/verify?token=${token}`;
  await enqueue("email", {
    to: user.email,
    subject: `Verify your email · ${config.brandName}`,
    text: `Hi ${user.name},\n\nConfirm your email address:\n${link}\n\nThis link expires in 48 hours. If you didn't create an account, ignore this email.`,
  });
}

export interface OrganizerApplicationInput {
  name: string; type: "UNIVERSITY" | "UNIVERSITY_CLUB" | "TECH_COMMUNITY" | "COMPANY" | "NONPROFIT" | "INDEPENDENT";
  description: string; website?: string; contactEmail: string; evidenceUrl?: string;
}

/** Role is always STUDENT here. An organizer sign-up adds a PENDING application that an admin must approve. */
export async function registerUser(input: { name: string; email: string; password: string; locale: string; ip: string; application?: OrganizerApplicationInput; requestId?: string }): Promise<AuthResult<{ userId: string }>> {
  const rl = await rateLimit(`register:${input.ip}`, 5, 3600); // 5 attempts per IP per hour
  if (!rl.allowed) {
    await recordSecurityEvent({ type: "auth.register_rate_limited", severity: "LOW", outcome: "blocked", ip: input.ip, requestId: input.requestId });
    return { ok: false, error: "tooMany" };
  }
  if ((await checkPassword(input.password)) === "breached") return { ok: false, error: "passwordBreached" };
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: {
        name: input.name, email: input.email, passwordHash, locale: input.locale,
        role: "STUDENT", // never taken from client input
        profile: { create: { displayName: input.name } },
        notificationPreference: { create: { unsubscribeToken: randomToken(24) } },
        ...(input.application ? { applications: { create: input.application } } : {}),
      },
    });
    await sendVerificationEmail(user.id);
    return { ok: true, userId: user.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "emailTaken" };
    throw e;
  }
}

/**
 * Login with failure-only throttling that cannot be abused to lock a victim out for good:
 *   - 5 failures per (account, IP) / 15 min (the attacker's own address is throttled first),
 *   - 20 failures per account across all IPs / 15 min (slows distributed guessing, but expires on its own),
 *   - 30 failures per IP / 15 min (credential stuffing across many accounts; shared campus NATs have headroom).
 * Nothing is ever locked permanently from unauthenticated requests. Successful login clears the pair counter.
 */
export async function authenticate(email: string, password: string, ctx: Ctx): Promise<AuthResult<{ userId: string; role: Role; mfaEnrolled: boolean }>> {
  const kPair = `login:pair:${email}:${ctx.ip}`, kAcct = `login:acct:${email}`, kIp = `login:ip:${ctx.ip}`;
  const checks = await Promise.all([isLimited(kPair, 5), isLimited(kAcct, 20), isLimited(kIp, 30)]);
  if (checks.some((c) => c.limited)) {
    await recordSecurityEvent({ type: "auth.login_rate_limited", severity: "MEDIUM", outcome: "blocked", ip: ctx.ip, requestId: ctx.requestId });
    return { ok: false, error: "tooMany" };
  }
  const user = await db.user.findFirst({ where: { email, deletedAt: null }, include: { mfa: { select: { enabledAt: true } } } });
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) {
    await Promise.all([rateLimit(kPair, 5, 900), rateLimit(kAcct, 20, 900), rateLimit(kIp, 30, 900)]);
    await recordSecurityEvent({ type: "auth.login_failed", severity: "LOW", outcome: "failure", actorId: user?.id, ip: ctx.ip, requestId: ctx.requestId });
    return { ok: false, error: "invalidCreds" };
  }
  if (user.status !== "ACTIVE") {
    await recordSecurityEvent({ type: "auth.login_suspended", severity: "LOW", outcome: "blocked", actorId: user.id, ip: ctx.ip, requestId: ctx.requestId });
    return { ok: false, error: "suspended" };
  }
  await resetLimit(kPair);
  if (needsRehash(user.passwordHash)) await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } }); // upgrade legacy scrypt → Argon2id
  await recordSecurityEvent({ type: "auth.login", severity: "INFO", actorId: user.id, ip: ctx.ip, requestId: ctx.requestId });
  return { ok: true, userId: user.id, role: user.role, mfaEnrolled: !!user.mfa?.enabledAt };
}

export const requiresSecondFactor = (role: Role, enrolled: boolean) => isPrivileged(role) || enrolled;

interface GoogleProfile { sub: string; email: string; emailVerified: boolean; name: string }

/**
 * Finds or creates the local account for a verified Google identity. Matches by the linked
 * `Account` row first (stable across email changes), then falls back to matching an existing
 * password account by email so a student who signed up normally can also sign in with Google.
 * A brand-new account is always STUDENT; the caller decides whether to offer an organizer
 * application afterwards (Google doesn't know a student from an organizer).
 */
export async function findOrCreateGoogleUser(profile: GoogleProfile, locale: string, ctx: Ctx): Promise<AuthResult<{ userId: string; role: Role; mfaEnrolled: boolean; isNewUser: boolean }>> {
  const rl = await rateLimit(`oauth:google:${ctx.ip}`, 20, 900); // 20 attempts per IP per 15 min
  if (!rl.allowed) {
    await recordSecurityEvent({ type: "auth.oauth_rate_limited", severity: "LOW", outcome: "blocked", ip: ctx.ip, requestId: ctx.requestId });
    return { ok: false, error: "tooMany" };
  }
  const existingAccount = await db.account.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.sub } },
    include: { user: { include: { mfa: { select: { enabledAt: true } } } } },
  });
  if (existingAccount) {
    const u = existingAccount.user;
    if (u.status !== "ACTIVE" || u.deletedAt) {
      await recordSecurityEvent({ type: "auth.login_suspended", severity: "LOW", outcome: "blocked", actorId: u.id, ip: ctx.ip, requestId: ctx.requestId });
      return { ok: false, error: "suspended" };
    }
    await recordSecurityEvent({ type: "auth.oauth_login", severity: "INFO", actorId: u.id, ip: ctx.ip, requestId: ctx.requestId });
    return { ok: true, userId: u.id, role: u.role, mfaEnrolled: !!u.mfa?.enabledAt, isNewUser: false };
  }

  const byEmail = await db.user.findFirst({ where: { email: profile.email, deletedAt: null }, include: { mfa: { select: { enabledAt: true } } } });
  if (byEmail) {
    if (byEmail.status !== "ACTIVE") {
      await recordSecurityEvent({ type: "auth.login_suspended", severity: "LOW", outcome: "blocked", actorId: byEmail.id, ip: ctx.ip, requestId: ctx.requestId });
      return { ok: false, error: "suspended" };
    }
    await db.account.create({ data: { userId: byEmail.id, provider: "google", providerAccountId: profile.sub } });
    await recordSecurityEvent({ type: "auth.oauth_linked", severity: "LOW", actorId: byEmail.id, ip: ctx.ip, requestId: ctx.requestId });
    return { ok: true, userId: byEmail.id, role: byEmail.role, mfaEnrolled: !!byEmail.mfa?.enabledAt, isNewUser: false };
  }

  const user = await db.user.create({
    data: {
      name: profile.name, email: profile.email, passwordHash: null, locale,
      role: "STUDENT",
      emailVerified: profile.emailVerified ? new Date() : null,
      profile: { create: { displayName: profile.name } },
      notificationPreference: { create: { unsubscribeToken: randomToken(24) } },
      accounts: { create: { provider: "google", providerAccountId: profile.sub } },
    },
  });
  if (!profile.emailVerified) await sendVerificationEmail(user.id);
  await recordSecurityEvent({ type: "auth.oauth_register", severity: "INFO", actorId: user.id, ip: ctx.ip, requestId: ctx.requestId });
  return { ok: true, userId: user.id, role: user.role, mfaEnrolled: false, isNewUser: true };
}

export async function verifyEmail(token: string): Promise<boolean> {
  const rec = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.type !== "VERIFY_EMAIL" || rec.usedAt || rec.expiresAt < new Date()) return false;
  await db.$transaction([
    db.user.updateMany({ where: { email: rec.identifier }, data: { emailVerified: new Date() } }),
    db.verificationToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
  ]);
  return true;
}

/** Always behaves the same from the outside (no account enumeration). 3 requests per account/hour, 10 per IP/hour. */
export async function requestPasswordReset(email: string, ip: string, requestId?: string) {
  const [byIp, byAcct] = await Promise.all([rateLimit(`reset:ip:${ip}`, 10, 3600), rateLimit(`reset:acct:${email}`, 3, 3600)]);
  if (!byIp.allowed || !byAcct.allowed) {
    await recordSecurityEvent({ type: "auth.reset_rate_limited", severity: "LOW", outcome: "blocked", ip, requestId });
    return;
  }
  const user = await db.user.findFirst({ where: { email, deletedAt: null, status: "ACTIVE" } });
  if (!user) return;
  const token = await issueToken(user.email, "RESET_PASSWORD", HOUR);
  await recordSecurityEvent({ type: "auth.reset_requested", actorId: user.id, ip, requestId }); // never logs the token
  await enqueue("email", {
    to: user.email,
    subject: `Reset your password · ${config.brandName}`,
    text: `Reset your password:\n${config.appUrl}/auth/reset-password?token=${token}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string, ctx?: Partial<Ctx>): Promise<boolean | "breached"> {
  const rec = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.type !== "RESET_PASSWORD" || rec.usedAt || rec.expiresAt < new Date()) return false;
  if ((await checkPassword(newPassword)) === "breached") return "breached";
  const passwordHash = await hashPassword(newPassword);
  let userId: string | null = null;
  await db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { email: rec.identifier } });
    if (!user) return;
    userId = user.id;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, emailVerified: user.emailVerified ?? new Date() } });
    await tx.verificationToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  });
  if (userId) {
    await revokeSessionsFor(userId); // sign out everywhere
    await recordSecurityEvent({ type: "auth.password_reset", severity: "MEDIUM", actorId: userId, ip: ctx?.ip, requestId: ctx?.requestId });
  }
  return true;
}
