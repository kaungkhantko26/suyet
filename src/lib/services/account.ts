import { db } from "../db";
import { isPrivileged } from "../auth/permissions";
import { recordSecurityEvent } from "../security/events";
import { revokeSessionsFor } from "./sessions";

/** Everything we hold about the user, as portable JSON (no password hash, MFA secret or recovery-code hashes). */
export async function exportAccountData(userId: string) {
  const u = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, role: true, locale: true, emailVerified: true, createdAt: true,
      profile: true, notificationPreference: { select: { locationSlugs: true, onlineOnly: true, deadlineReminders: true, newEventAlerts: true, emailEnabled: true, inAppEnabled: true } },
      interests: { select: { category: { select: { slug: true, nameEn: true } } } },
      savedEvents: { select: { createdAt: true, event: { select: { slug: true, title: true } } } },
      notifications: { select: { type: true, title: true, createdAt: true, readAt: true }, take: 500, orderBy: { createdAt: "desc" } },
      memberships: { select: { role: true, organizer: { select: { slug: true, name: true } } } },
      applications: { select: { name: true, type: true, status: true, createdAt: true } },
      reports: { select: { reason: true, details: true, status: true, createdAt: true } },
      registrations: { select: { status: true, answers: true, consentAt: true, createdAt: true, event: { select: { slug: true, title: true } } } },
    },
  });
  return { exportedAt: new Date().toISOString(), format: "letstech-events-account-export/v1", account: u };
}

export type DeleteResult = "ok" | "staff-account" | "invalid";

/**
 * Account deletion: personal data is erased/anonymised, sessions and MFA are destroyed. Rows that audit trails reference
 * (the user id) are kept but contain no personal data. Staff accounts must be demoted first (prevents accidental or
 * malicious removal of privileged accounts and keeps the admin audit trail attributable).
 */
export async function deleteAccount(userId: string, ctx: { ip?: string; requestId?: string } = {}): Promise<DeleteResult> {
  const u = await db.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!u) return "invalid";
  if (isPrivileged(u.role)) return "staff-account";
  await db.$transaction([
    db.registration.deleteMany({ where: { userId } }), // answers are personal data: erased with the account
    db.savedEvent.deleteMany({ where: { userId } }),
    db.userInterest.deleteMany({ where: { userId } }),
    db.notification.deleteMany({ where: { userId } }),
    db.notificationPreference.deleteMany({ where: { userId } }),
    db.userProfile.deleteMany({ where: { userId } }),
    db.mfaCredential.deleteMany({ where: { userId } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.organizerMember.deleteMany({ where: { userId } }),
    db.account.deleteMany({ where: { userId } }),
    db.verificationToken.deleteMany({ where: { identifier: u.email } }),
    db.user.update({ where: { id: userId }, data: { email: `deleted-${userId}@deleted.invalid`, name: "Deleted user", passwordHash: null, status: "SUSPENDED", deletedAt: new Date(), role: "STUDENT" } }),
  ]);
  await revokeSessionsFor(userId);
  await recordSecurityEvent({ type: "account.deleted", severity: "LOW", actorId: userId, ip: ctx.ip, requestId: ctx.requestId, resourceType: "User", resourceId: userId });
  return "ok";
}
