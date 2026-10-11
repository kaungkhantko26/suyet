import { Prisma } from "@prisma/client";
import { db } from "./db";

export async function enqueue(type: string, payload: Prisma.InputJsonValue, opts: { runAt?: Date; dedupeKey?: string } = {}) {
  try {
    return await db.job.create({ data: { type, payload, runAt: opts.runAt, dedupeKey: opts.dedupeKey } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // already queued
    throw e;
  }
}

/** Atomically claim due jobs (safe with multiple workers via SKIP LOCKED). */
export async function claimJobs(limit = 10) {
  return db.$queryRaw<{ id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = now(), "attempts" = "attempts" + 1, "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE ("status" = 'PENDING' AND "runAt" <= now())
         OR ("status" = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
}

export async function completeJob(id: string) {
  await db.job.update({ where: { id }, data: { status: "DONE", lockedAt: null, lastError: null } });
}

export async function failJob(id: string, attempts: number, maxAttempts: number, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  const exhausted = attempts >= maxAttempts;
  await db.job.update({
    where: { id },
    data: {
      status: exhausted ? "FAILED" : "PENDING",
      lockedAt: null,
      lastError: msg.slice(0, 500),
      runAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** attempts) * 1000),
    },
  });
}
