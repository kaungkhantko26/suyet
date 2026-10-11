/** Background worker: processes the database-backed job queue and schedules recurring jobs. */
import { claimJobs, completeJob, failJob } from "../src/lib/jobs";
import { handlers, scheduleRecurring } from "../src/lib/worker/handlers";
import { db } from "../src/lib/db";

let running = true;
process.on("SIGTERM", () => (running = false));
process.on("SIGINT", () => (running = false));

const log = (level: string, msg: string, extra: object = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));

async function tick() {
  await scheduleRecurring();
  const jobs = await claimJobs(10);
  for (const job of jobs) {
    const h = handlers[job.type];
    try {
      if (!h) throw new Error(`No handler for job type ${job.type}`);
      await h((job.payload ?? {}) as Record<string, unknown>);
      await completeJob(job.id);
      log("info", "job done", { id: job.id, type: job.type });
    } catch (e) {
      await failJob(job.id, job.attempts, job.maxAttempts, e);
      log("error", "job failed", { id: job.id, type: job.type, attempts: job.attempts, error: String(e) });
    }
  }
  return jobs.length;
}

log("info", "worker started");
while (running) {
  try {
    const n = await tick();
    if (n === 0) await new Promise((r) => setTimeout(r, 5000));
  } catch (e) {
    log("error", "tick failed", { error: String(e) });
    await new Promise((r) => setTimeout(r, 10000));
  }
}
await db.$disconnect();
log("info", "worker stopped");
