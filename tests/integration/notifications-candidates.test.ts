import { beforeEach, describe, expect, it } from "vitest";
import { notifyNewMatchingEvent, notifySavers, scanReminders } from "@/lib/services/notifications";
import { ingestCandidate, candidatePayloadSchema, promoteCandidate, rejectCandidate } from "@/lib/services/candidates";
import { claimJobs, completeJob, enqueue, failJob } from "@/lib/jobs";
import { handlers } from "@/lib/worker/handlers";
import { createEvent, setPublishState } from "@/lib/services/events";
import { POST as internalPost } from "@/app/api/internal/event-candidates/route";
import { toDateTimeLocal } from "@/lib/dates";
import { db, categoryIds, future, makeOrganizer, makeUser, resetDb } from "../helpers/db";
import { eventInput } from "../helpers/event-input";

beforeEach(resetDb);

async function liveEvent(over: Record<string, unknown> = {}) {
  const admin = await makeUser("ADMIN");
  const ou = await makeUser("ORGANIZER");
  const org = await makeOrganizer(ou.id);
  const ev = await createEvent(ou, org.id, await eventInput(over));
  await setPublishState(admin, ev.id, "PUBLISHED");
  return { admin, ou, org, ev };
}

describe("notifications", () => {
  it("notifies users whose interests match, once (no duplicates on re-run)", async () => {
    const { ev } = await liveEvent();
    const match = await makeUser(); const other = await makeUser();
    await db.userInterest.create({ data: { userId: match.id, categoryId: (await categoryIds("hackathons"))[0] } });
    await db.userInterest.create({ data: { userId: other.id, categoryId: (await categoryIds("robotics"))[0] } });
    expect(await notifyNewMatchingEvent(ev.id)).toBe(1);
    expect(await notifyNewMatchingEvent(ev.id)).toBe(0);
    const n = await db.notification.findMany({ include: { deliveries: true } });
    expect(n).toHaveLength(1);
    expect(n[0].userId).toBe(match.id);
    expect(n[0].deliveries.map((d) => d.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
    expect(n[0].deliveries.find((d) => d.channel === "EMAIL")!.status).toBe("PENDING"); // sent later by the worker
  });
  it("respects preferences: email off, online-only, new-event alerts off", async () => {
    const { ev } = await liveEvent({ format: "ONSITE", city: "Yangon", onlineUrl: "" });
    const [a, b, c] = [await makeUser(), await makeUser(), await makeUser()];
    for (const u of [a, b, c]) await db.userInterest.create({ data: { userId: u.id, categoryId: (await categoryIds("hackathons"))[0] } });
    await db.notificationPreference.update({ where: { userId: a.id }, data: { emailEnabled: false } });
    await db.notificationPreference.update({ where: { userId: b.id }, data: { onlineOnly: true } });
    await db.notificationPreference.update({ where: { userId: c.id }, data: { newEventAlerts: false } });
    expect(await notifyNewMatchingEvent(ev.id)).toBe(1); // only user a (in-app only)
    const n = await db.notification.findFirstOrThrow({ include: { deliveries: true } });
    expect(n.userId).toBe(a.id);
    expect(n.deliveries.map((d) => d.channel)).toEqual(["IN_APP"]);
  });
  it("deadline reminders go to savers once per window; unverified emails get in-app only", async () => {
    const { ev } = await liveEvent({ registrationDeadline: toDateTimeLocal(future(1)) });
    const saver = await makeUser("STUDENT", { verified: false });
    await db.savedEvent.create({ data: { userId: saver.id, eventId: ev.id } });
    expect(await scanReminders()).toBeGreaterThanOrEqual(1);
    const again = await scanReminders();
    expect(again).toBe(0);
    const n = await db.notification.findFirstOrThrow({ where: { type: "REGISTRATION_CLOSING_SOON" }, include: { deliveries: true } });
    expect(n.deliveries.map((d) => d.channel)).toEqual(["IN_APP"]);
  });
  it("deadline reminders can be turned off", async () => {
    const { ev } = await liveEvent({ registrationDeadline: toDateTimeLocal(future(1)) });
    const s = await makeUser();
    await db.savedEvent.create({ data: { userId: s.id, eventId: ev.id } });
    await db.notificationPreference.update({ where: { userId: s.id }, data: { deadlineReminders: false } });
    await scanReminders();
    expect(await db.notification.count({ where: { type: "REGISTRATION_CLOSING_SOON" } })).toBe(0);
  });
  it("cancel/update notices reach savers", async () => {
    const { ev } = await liveEvent();
    const s = await makeUser();
    await db.savedEvent.create({ data: { userId: s.id, eventId: ev.id } });
    expect(await notifySavers(ev.id, "EVENT_CANCELLED", "w")).toBe(1);
    expect(await notifySavers(ev.id, "EVENT_CANCELLED", "w")).toBe(0);
  });
  it("email delivery runs in the worker and records status", async () => {
    const { ev } = await liveEvent();
    const s = await makeUser();
    await db.userInterest.create({ data: { userId: s.id, categoryId: (await categoryIds("hackathons"))[0] } });
    await notifyNewMatchingEvent(ev.id);
    const job = (await claimJobs(10)).find((j) => j.type === "notification-email")!;
    await handlers["notification-email"](job.payload as Record<string, unknown>); // dev transport logs instead of sending
    const d = await db.notificationDelivery.findFirstOrThrow({ where: { channel: "EMAIL" } });
    expect(d).toMatchObject({ status: "SENT", attempts: 1 });
    expect(d.sentAt).not.toBeNull();
  });
});

describe("job queue", () => {
  it("claims due jobs exactly once, retries with backoff, and fails after max attempts", async () => {
    await enqueue("email", { to: "a@b.c", subject: "s", text: "t" }, { dedupeKey: "k" });
    expect(await enqueue("email", {}, { dedupeKey: "k" })).toBeNull(); // dedupe
    const [j] = await claimJobs(5);
    expect((await claimJobs(5))).toHaveLength(0); // already running
    await failJob(j.id, 1, 3, new Error("boom"));
    expect(await db.job.findUniqueOrThrow({ where: { id: j.id } })).toMatchObject({ status: "PENDING", lastError: "boom" });
    await failJob(j.id, 3, 3, new Error("final"));
    expect((await db.job.findUniqueOrThrow({ where: { id: j.id } })).status).toBe("FAILED");
    await enqueue("x", {});
    await completeJob((await claimJobs(1))[0].id);
  });
});

describe("event candidates (n8n pipeline)", () => {
  const payload = (over = {}) => candidatePayloadSchema.parse({ title: "Example Student Hackathon", description: "Example", category: "Hackathon", organizer: "Example Organizer", sourceUrl: "https://example.org/event", registrationUrl: "https://example.org/register", startDate: "2030-11-20T09:00:00+06:30", registrationDeadline: "2030-11-15T23:59:00+06:30", format: "Online", location: "Myanmar", ...over });

  it("creates a PENDING_REVIEW candidate and never a public event", async () => {
    const { candidate, created } = await ingestCandidate(payload());
    expect(created).toBe(true);
    expect(candidate.status).toBe("PENDING_REVIEW");
    expect(candidate.startAt!.toISOString()).toBe("2030-11-20T02:30:00.000Z");
    expect(await db.event.count()).toBe(0);
  });
  it("stores unknown fields as missing instead of inventing them", async () => {
    const { candidate } = await ingestCandidate(candidatePayloadSchema.parse({ title: "Sparse Event", sourceUrl: "https://example.org/sparse" }));
    expect(candidate.missingFields).toEqual(expect.arrayContaining(["description", "startDate", "format", "location", "registrationUrl"]));
    expect(candidate).toMatchObject({ startAt: null, format: null, description: null });
  });
  it("refuses to guess a timezone and flags past/inconsistent dates", async () => {
    const { candidate } = await ingestCandidate(payload({ startDate: "2030-11-20T09:00:00", sourceUrl: "https://example.org/naive" }));
    expect(candidate.startAt).toBeNull();
    expect(candidate.validationIssues.join()).toContain("missing timezone");
    const bad = await ingestCandidate(payload({ sourceUrl: "https://example.org/bad", registrationDeadline: "2030-12-01T00:00:00+06:30", startDate: "2020-01-01T00:00:00+06:30" }));
    expect(bad.candidate.validationIssues.join()).toMatch(/after startDate/);
    expect(bad.candidate.validationIssues.join()).toMatch(/in the past/);
  });
  it("is idempotent per key", async () => {
    const a = await ingestCandidate(payload(), "key-1");
    const b = await ingestCandidate(payload(), "key-1");
    expect(b.created).toBe(false);
    expect(b.candidate.id).toBe(a.candidate.id);
    expect(await db.eventCandidate.count()).toBe(1);
  });
  it("flags (but does not merge) duplicates of existing events and earlier candidates", async () => {
    const { ev } = await liveEvent({ sourceUrl: "https://example.org/event", title: "Example Student Hackathon" });
    const c1 = await ingestCandidate(payload(), "k1");
    expect(c1.candidate.duplicateOfEventId).toBe(ev.id);
    expect(c1.candidate.duplicateReasons).toContain("same-source-url");
    expect(c1.candidate.status).toBe("PENDING_REVIEW");
    const c2 = await ingestCandidate(payload(), "k2");
    expect(c2.candidate.duplicateReasons).toContain("same-url-as-earlier-candidate");
    expect(await db.event.count()).toBe(1);
  });
  it("admin can promote to a DRAFT event (still unpublished) or reject", async () => {
    const admin = await makeUser("ADMIN");
    const org = await makeOrganizer();
    const { candidate } = await ingestCandidate(payload({ sourceUrl: "https://example.org/promote" }));
    const ev = await promoteCandidate(admin, candidate.id, { ...(await eventInput({ title: "Promoted" })), organizerId: org.id });
    expect(ev.publishState).toBe("DRAFT");
    expect((await db.eventCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).promotedEventId).toBe(ev.id);
    const c2 = await ingestCandidate(payload({ sourceUrl: "https://example.org/reject" }));
    await rejectCandidate(admin, c2.candidate.id, "spam");
    expect((await db.eventCandidate.findUniqueOrThrow({ where: { id: c2.candidate.id } })).status).toBe("REJECTED");
    await expect(promoteCandidate(await makeUser("ORGANIZER"), c2.candidate.id, { ...(await eventInput()), organizerId: org.id })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("POST /api/internal/event-candidates", () => {
  const call = (body: unknown, headers: Record<string, string> = {}) =>
    internalPost(new Request("http://x/api/internal/event-candidates", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers }));
  const auth = { authorization: "Bearer test-internal-secret" };
  const ok = { title: "API Event", sourceUrl: "https://example.org/api-event" };

  it("401 without valid credentials; nothing is stored", async () => {
    expect((await call(ok)).status).toBe(401);
    expect((await call(ok, { authorization: "Bearer wrong" })).status).toBe(401);
    expect(await db.eventCandidate.count()).toBe(0);
  });
  it("201 → PENDING_REVIEW, then 200 on replay", async () => {
    const r1 = await call(ok, { ...auth, "idempotency-key": "z" });
    expect(r1.status).toBe(201);
    expect((await r1.json()).status).toBe("PENDING_REVIEW");
    expect((await call(ok, { ...auth, "idempotency-key": "z" })).status).toBe(200);
    expect(await db.event.count()).toBe(0);
  });
  it("400/422 for malformed or invalid payloads; 413 for oversized bodies", async () => {
    expect((await call("{not json", auth)).status).toBe(400);
    expect((await call({ title: "x", sourceUrl: "javascript:alert(1)" }, auth)).status).toBe(422);
    expect((await call("x".repeat(200_000), auth)).status).toBe(413);
  });
  it("rate limits", async () => {
    let last = 0;
    for (let i = 0; i < 125; i++) last = (await call({ title: `Rate ${i}`, sourceUrl: `https://example.org/r${i}` }, auth)).status;
    expect(last).toBe(429);
  });
});
