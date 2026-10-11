import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { claimJobs, completeJob, failJob } from "@/lib/jobs";
import { log } from "@/lib/log";
import { handlers, scheduleRecurring } from "@/lib/worker/handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(given), b = Buffer.from(secret);
  return !!secret && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Serverless stand-in for the long-running worker: schedules the recurring jobs, then drains a bounded batch of due
 * jobs synchronously within this request (there is no always-on process on Vercel to poll the queue).
 * Vercel Cron Jobs call this with GET and the platform-injected `Authorization: Bearer $CRON_SECRET` header.
 * POST is kept for a manual/external trigger with the same secret.
 */
async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await scheduleRecurring();
  const started = Date.now();
  const budgetMs = 45_000;
  let processed = 0;
  while (Date.now() - started < budgetMs) {
    const jobs = await claimJobs(10);
    if (jobs.length === 0) break;
    for (const job of jobs) {
      try {
        const h = handlers[job.type];
        if (!h) throw new Error(`No handler for job type ${job.type}`);
        await h((job.payload ?? {}) as Record<string, unknown>);
        await completeJob(job.id);
      } catch (e) {
        await failJob(job.id, job.attempts, job.maxAttempts, e);
        log("error", "cron job failed", { id: job.id, type: job.type, error: String(e) });
      }
      processed++;
    }
  }
  return NextResponse.json({ ok: true, processed });
}

export const GET = run;
export const POST = run;
