import { db } from "../db";

/** Revoke every session of a user (role change, suspension, password reset, "sign out everywhere"). */
export async function revokeSessionsFor(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}
