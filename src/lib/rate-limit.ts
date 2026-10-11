import { db } from "./db";
export { clientIp } from "./security/ip";

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Fixed-window limiter backed by PostgreSQL so it works across processes and instances. Counts the call. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSec * 1000);
  const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  const { count, resetAt: reset } = rows[0];
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec: Math.max(1, Math.ceil((new Date(reset).getTime() - now.getTime()) / 1000)) };
}

/** Is `key` already over `limit`? Does not count the call (used for failure-only counters such as failed logins). */
export async function isLimited(key: string, limit: number): Promise<{ limited: boolean; retryAfterSec: number }> {
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row || row.resetAt <= new Date() || row.count < limit) return { limited: false, retryAfterSec: 0 };
  return { limited: true, retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) };
}

export async function resetLimit(...keys: string[]) {
  await db.rateLimit.deleteMany({ where: { key: { in: keys } } });
}
