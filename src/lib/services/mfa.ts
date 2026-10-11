import { db } from "../db";
import { recordSecurityEvent } from "../security/events";
import { rateLimit, resetLimit } from "../rate-limit";
import { decryptSecret, encryptSecret, generateRecoveryCodes, generateSecret, hashRecoveryCode, verifyTotp } from "../security/totp";

export async function beginEnrollment(userId: string) {
  const secret = generateSecret();
  await db.mfaCredential.upsert({
    where: { userId },
    // Re-enrolling replaces only a pending (not yet enabled) credential.
    update: { secretEnc: encryptSecret(secret), lastUsedStep: null },
    create: { userId, secretEnc: encryptSecret(secret) },
  });
  return secret;
}

export async function isEnrolled(userId: string) {
  const c = await db.mfaCredential.findUnique({ where: { userId }, select: { enabledAt: true } });
  return !!c?.enabledAt;
}

/** Confirms the first code, enables MFA and returns one-time recovery codes (plaintext shown once, hashes stored). */
export async function confirmEnrollment(userId: string, code: string, ctx: { ip?: string; requestId?: string } = {}): Promise<string[] | null> {
  const cred = await db.mfaCredential.findUnique({ where: { userId } });
  if (!cred || cred.enabledAt) return null;
  const step = verifyTotp(decryptSecret(cred.secretEnc), code);
  if (step === null) return null;
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.mfaCredential.update({ where: { userId }, data: { enabledAt: new Date(), lastUsedStep: step } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) }),
  ]);
  await recordSecurityEvent({ type: "mfa.enabled", actorId: userId, ip: ctx.ip, requestId: ctx.requestId, resourceType: "User", resourceId: userId });
  return codes;
}

export type MfaResult = "ok" | "invalid" | "limited";

/** Verifies a TOTP code or a one-time recovery code, with rate limiting and replay protection. */
export async function verifySecondFactor(userId: string, input: string, ctx: { ip?: string; requestId?: string } = {}): Promise<MfaResult> {
  const rl = await rateLimit(`mfa:${userId}`, 5, 300);
  if (!rl.allowed) {
    await recordSecurityEvent({ type: "mfa.rate_limited", severity: "MEDIUM", outcome: "blocked", actorId: userId, ip: ctx.ip, requestId: ctx.requestId });
    return "limited";
  }
  const cred = await db.mfaCredential.findUnique({ where: { userId } });
  if (!cred?.enabledAt) return "invalid";
  const value = input.trim();

  let ok = false;
  if (/^\d{6}$/.test(value)) {
    const step = verifyTotp(decryptSecret(cred.secretEnc), value, { lastUsedStep: cred.lastUsedStep });
    if (step !== null) {
      // Conditional update makes the "use each code once" rule race-safe.
      const r = await db.mfaCredential.updateMany({ where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] }, data: { lastUsedStep: step } });
      ok = r.count === 1;
    }
  } else {
    const r = await db.mfaRecoveryCode.updateMany({ where: { userId, codeHash: hashRecoveryCode(value), usedAt: null }, data: { usedAt: new Date() } });
    ok = r.count === 1;
    if (ok) await recordSecurityEvent({ type: "mfa.recovery_code_used", severity: "MEDIUM", actorId: userId, ip: ctx.ip, requestId: ctx.requestId });
  }
  if (!ok) {
    await recordSecurityEvent({ type: "mfa.failed", severity: "LOW", outcome: "failure", actorId: userId, ip: ctx.ip, requestId: ctx.requestId });
    return "invalid";
  }
  await resetLimit(`mfa:${userId}`);
  return "ok";
}

export async function disableMfa(userId: string, actorId: string) {
  await db.$transaction([db.mfaCredential.deleteMany({ where: { userId } }), db.mfaRecoveryCode.deleteMany({ where: { userId } })]);
  await recordSecurityEvent({ type: "mfa.disabled", severity: "MEDIUM", actorId, resourceType: "User", resourceId: userId });
}
