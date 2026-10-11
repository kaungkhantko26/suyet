import { beforeEach, describe, expect, it } from "vitest";
import { buildWhere, listEvents, getEventBySlug } from "@/lib/events/queries";
import { parseEventFilters } from "@/lib/events/filters";
import { createEvent, reviewSubmission, setFeatured, setOverrides, setPublishState, setVerification, submitForReview, updateEvent, ServiceError } from "@/lib/services/events";
import { computeEventStatus } from "@/lib/event-status";
import { toDateTimeLocal } from "@/lib/dates";
import { db, future, makeOrganizer, makeUser, resetDb } from "../helpers/db";
import { eventInput } from "../helpers/event-input";

beforeEach(resetDb);

async function setup() {
  const admin = await makeUser("ADMIN");
  const orgUser = await makeUser("ORGANIZER");
  const other = await makeUser("ORGANIZER");
  const org = await makeOrganizer(orgUser.id);
  const otherOrg = await makeOrganizer(other.id);
  return { admin, orgUser, other, org, otherOrg };
}
const publicSlugs = async (q = "") => (await listEvents(parseEventFilters(q ? { q } : {}))).items.map((e) => e.slug);

describe("submission → review → publish", () => {
  it("unapproved events stay hidden everywhere public", async () => {
    const { orgUser, org } = await setup();
    const ev = await createEvent(orgUser, org.id, await eventInput());
    expect(ev.publishState).toBe("DRAFT");
    expect(await publicSlugs()).not.toContain(ev.slug);
    expect(await getEventBySlug(ev.slug)).toBeNull();
    await submitForReview(orgUser, ev.id); // pending review is still not public
    expect(await publicSlugs()).not.toContain(ev.slug);
  });

  it("organizers cannot self-approve; admin approval publishes and the event appears in search", async () => {
    const { admin, orgUser, org } = await setup();
    const ev = await createEvent(orgUser, org.id, await eventInput({ title: "Zebra Robotics Challenge" }));
    const sub = await submitForReview(orgUser, ev.id);
    await expect(reviewSubmission(orgUser, sub.id, "APPROVED")).rejects.toMatchObject({ code: "forbidden" });
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).publishState).toBe("DRAFT");

    await reviewSubmission(admin, sub.id, "APPROVED");
    const live = await db.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(live.publishState).toBe("PUBLISHED");
    expect(live.publishedAt).not.toBeNull();
    expect(live.verificationStatus).toBe("UNVERIFIED"); // approval is not verification
    expect(await publicSlugs()).toContain(ev.slug);
    expect(await publicSlugs("zebra")).toContain(ev.slug); // full-text search
    expect(await publicSlugs("nonexistentterm")).not.toContain(ev.slug);
    expect(await db.adminAuditLog.count({ where: { action: "submission.approved" } })).toBe(1);
    expect(await db.job.count({ where: { type: "notify-new-event" } })).toBe(1);
  });

  it("reject / request-changes need notes and keep the event hidden", async () => {
    const { admin, orgUser, org } = await setup();
    const ev = await createEvent(orgUser, org.id, await eventInput());
    const sub = await submitForReview(orgUser, ev.id);
    await expect(reviewSubmission(admin, sub.id, "REJECTED", " ")).rejects.toBeInstanceOf(ServiceError);
    await reviewSubmission(admin, sub.id, "CHANGES_REQUESTED", "Please add the official source");
    expect((await db.eventSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("CHANGES_REQUESTED");
    expect(await publicSlugs()).not.toContain(ev.slug);
    await expect(reviewSubmission(admin, sub.id, "APPROVED")).rejects.toMatchObject({ code: "invalidState" }); // already reviewed
  });

  it("organizers cannot touch another organizer's events", async () => {
    const { orgUser, other, org } = await setup();
    const ev = await createEvent(orgUser, org.id, await eventInput());
    await expect(updateEvent(other, ev.id, await eventInput())).rejects.toMatchObject({ code: "forbidden" });
    await expect(submitForReview(other, ev.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(createEvent(other, org.id, await eventInput())).rejects.toMatchObject({ code: "forbidden" });
    await expect(setOverrides(other, ev.id, { cancelled: true })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("students cannot create events", async () => {
    const { org } = await setup();
    const student = await makeUser("STUDENT");
    await expect(createEvent(student, org.id, await eventInput())).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("editing a published event", () => {
  async function published() {
    const ctx = await setup();
    const ev = await createEvent(ctx.orgUser, ctx.org.id, await eventInput({ title: "Original Title" }));
    await reviewSubmission(ctx.admin, (await submitForReview(ctx.orgUser, ev.id)).id, "APPROVED");
    return { ...ctx, ev };
  }
  it("substantial changes are queued for review while the live listing is unchanged", async () => {
    const { orgUser, admin, ev } = await published();
    const newStart = toDateTimeLocal(future(45));
    const res = await updateEvent(orgUser, ev.id, await eventInput({ title: "Original Title", startAt: newStart, description: "Edited long text" }));
    expect(res.queuedForReview).toBe(true);
    const live = await db.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(live.startAt.getTime()).toBe(ev.startAt.getTime()); // not applied yet
    expect(live.description).toBe("Edited long text"); // non-substantial applied immediately
    const pending = await db.eventSubmission.findFirstOrThrow({ where: { eventId: ev.id, status: "PENDING_REVIEW" } });
    expect(pending.isUpdate).toBe(true);
    await reviewSubmission(admin, pending.id, "APPROVED");
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).startAt.toISOString()).toBe(new Date(newStart.length ? (await eventInput({ startAt: newStart })).startAt! : 0).toISOString());
  });
  it("minor edits apply immediately without review", async () => {
    const { orgUser, ev } = await published();
    const res = await updateEvent(orgUser, ev.id, await eventInput({ title: "Original Title", prizes: "New prizes" }));
    expect(res).toMatchObject({ applied: true, queuedForReview: false });
  });
  it("a verified event drops to NEEDS_REVIEW when approved changes alter its details", async () => {
    const { orgUser, admin, ev } = await published();
    await setVerification(admin, ev.id, "VERIFIED", { notes: "checked" });
    await updateEvent(orgUser, ev.id, await eventInput({ title: "Original Title", registrationUrl: "https://example.org/new-link" }));
    const sub = await db.eventSubmission.findFirstOrThrow({ where: { eventId: ev.id, status: "PENDING_REVIEW" } });
    await reviewSubmission(admin, sub.id, "APPROVED");
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).verificationStatus).toBe("NEEDS_REVIEW");
  });
  it("organizer cancellation updates status and notifies savers via the queue", async () => {
    const { orgUser, ev } = await published();
    await setOverrides(orgUser, ev.id, { cancelled: true });
    expect(computeEventStatus(await db.event.findUniqueOrThrow({ where: { id: ev.id } }))).toBe("CANCELLED");
    expect(await db.job.count({ where: { type: "notify-savers" } })).toBe(1);
  });
});

describe("admin controls & verification", () => {
  it("verification requires evidence (an official source URL) and records who/when", async () => {
    const { admin, orgUser, org } = await setup();
    const ev = await createEvent(orgUser, org.id, await eventInput({ sourceUrl: "" }));
    await expect(setVerification(admin, ev.id, "VERIFIED")).rejects.toMatchObject({ code: "needsEvidence" });
    await setVerification(admin, ev.id, "VERIFIED", { officialSourceUrl: "https://example.org/official", notes: "Checked page" });
    const v = await db.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(v).toMatchObject({ verificationStatus: "VERIFIED", verifiedById: admin.id, sourceUrl: "https://example.org/official" });
    expect(v.lastVerifiedAt).not.toBeNull();
    expect(await db.eventVerification.count({ where: { eventId: ev.id } })).toBe(1);
  });
  it("only admins can verify, publish or feature; only published events can be featured", async () => {
    const { admin, orgUser, org } = await setup();
    const ev = await createEvent(orgUser, org.id, await eventInput());
    await expect(setVerification(orgUser, ev.id, "VERIFIED")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setPublishState(orgUser, ev.id, "PUBLISHED")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setFeatured(admin, ev.id, true)).rejects.toMatchObject({ code: "invalidState" });
    await setPublishState(admin, ev.id, "PUBLISHED");
    await setFeatured(admin, ev.id, true);
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).featured).toBe(true);
    await setPublishState(admin, ev.id, "DRAFT"); // unpublishing also removes the feature flag
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).featured).toBe(false);
  });
});

describe("public filters against the database", () => {
  it("combines category, format, fee and registration status; hides completed by default", async () => {
    const { admin, orgUser, org } = await setup();
    const mk = async (over: Record<string, unknown>) => {
      const ev = await createEvent(orgUser, org.id, await eventInput(over));
      await setPublishState(admin, ev.id, "PUBLISHED");
      return ev;
    };
    const free = await mk({ title: "Free Online Hack" });
    const paid = await mk({ title: "Paid Onsite Workshop", format: "ONSITE", city: "Yangon", onlineUrl: "", feeAmount: "5000", categoryIds: (await db.eventCategory.findMany({ where: { slug: "technology-workshops" } })).map((c) => c.id) });
    const closed = await mk({ title: "Closed Reg Hack", registrationDeadline: toDateTimeLocal(future(-1)), startAt: toDateTimeLocal(future(2)) });
    const slugs = async (q: Record<string, string>) => (await listEvents(parseEventFilters(q))).items.map((e) => e.slug).sort();
    expect(await slugs({ format: "online", fee: "free" })).toEqual([closed.slug, free.slug].sort());
    expect(await slugs({ category: "technology-workshops" })).toEqual([paid.slug]);
    expect(await slugs({ fee: "paid" })).toEqual([paid.slug]);
    expect(await slugs({ registration: "open" })).toEqual([free.slug, paid.slug].sort());
    expect(await slugs({ registration: "closed" })).toEqual([closed.slug]);
    expect(await slugs({ past: "1" })).toEqual([]);
    expect(Object.keys(await buildWhere(parseEventFilters({})))).toContain("AND");
  });
});
