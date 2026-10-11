import { beforeEach, describe, expect, it } from "vitest";
import { createEvent, setPublishState, updateEvent } from "@/lib/services/events";
import { activeCount, decideRegistration, exportRegistrationsCsv, listRegistrations, loadForm, myRegistrations, registrationCounts, saveForm, submitRegistration, withdrawRegistration } from "@/lib/services/registrations";
import { formSchema } from "@/lib/registration/schema";
import { toDateTimeLocal } from "@/lib/dates";
import { db, future, makeOrganizer, makeUser, resetDb } from "../helpers/db";
import { eventInput } from "../helpers/event-input";

beforeEach(resetDb);

async function setup(over: Record<string, unknown> = {}, formOver: Record<string, unknown> = {}) {
  const admin = await makeUser("ADMIN");
  const orgUser = await makeUser("ORGANIZER");
  const org = await makeOrganizer(orgUser.id);
  const ev = await createEvent(orgUser, org.id, await eventInput({ registrationMode: "ON_PLATFORM", registrationUrl: "", ...over }));
  await setPublishState(admin, ev.id, "PUBLISHED");
  const form = formSchema.parse({
    enabled: true, capacity: null,
    fields: [{ type: "SHORT_TEXT", label: "School", required: true }, { type: "SINGLE_CHOICE", label: "Level", required: true, options: ["Beginner", "Advanced"] }],
    ...formOver,
  });
  await saveForm(orgUser, ev.id, form);
  const fields = (await loadForm(ev.id))!.fields;
  const answers = { [fields[0].id]: "UCSY", [fields[1].id]: "Beginner" };
  return { admin, orgUser, org, ev, fields, answers };
}
const student = () => makeUser("STUDENT");

describe("on-site registration", () => {
  it("event creation stores no external link for on-platform events", async () => {
    const { ev } = await setup({ registrationUrl: "https://example.org/ignored" });
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).registrationUrl).toBeNull();
  });

  it("a student registers; answers are stored with a question snapshot; a confirmation email is queued", async () => {
    const { ev, answers } = await setup();
    const s = await student();
    const r = await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, answers);
    expect(r.ok).toBe(true);
    const row = await db.registration.findFirstOrThrow({ where: { userId: s.id } });
    expect(row.status).toBe("APPROVED"); // no manual review configured → accepted automatically
    expect((row.answers as { label: string; value: string }[]).map((a) => `${a.label}=${a.value}`)).toEqual(["School=UCSY", "Level=Beginner"]);
    expect(await db.job.count({ where: { type: "email", payload: { path: ["subject"], string_contains: "registered" } } })).toBe(1);
    expect((await myRegistrations(s.id))).toHaveLength(1);
  });

  it("requires a verified email, valid answers, and one registration per person", async () => {
    const { ev, answers, fields } = await setup();
    const s = await student();
    expect(await submitRegistration({ id: s.id, emailVerified: false }, ev.slug, answers)).toMatchObject({ ok: false, error: "unverified" });
    const bad = await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, { [fields[0].id]: "UCSY", [fields[1].id]: "Expert" });
    expect(bad).toMatchObject({ ok: false, error: "invalid" });
    expect(await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, answers)).toMatchObject({ ok: true });
    expect(await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, answers)).toMatchObject({ ok: false, error: "already" });
    expect(await db.registration.count()).toBe(1);
  });

  it("enforces capacity and frees a seat on withdrawal; re-registering reuses the row", async () => {
    const { ev, answers } = await setup({}, { capacity: 2 });
    const [a, b, c] = [await student(), await student(), await student()];
    expect((await submitRegistration({ id: a.id, emailVerified: true }, ev.slug, answers)).ok).toBe(true);
    expect((await submitRegistration({ id: b.id, emailVerified: true }, ev.slug, answers)).ok).toBe(true);
    expect(await submitRegistration({ id: c.id, emailVerified: true }, ev.slug, answers)).toMatchObject({ ok: false, error: "full" });
    expect(await withdrawRegistration(a.id, ev.id)).toBe(true);
    expect(await activeCount(ev.id)).toBe(1);
    expect((await submitRegistration({ id: c.id, emailVerified: true }, ev.slug, answers)).ok).toBe(true);
    expect((await submitRegistration({ id: a.id, emailVerified: true }, ev.slug, answers))).toMatchObject({ ok: false, error: "full" });
  });

  it("the last seat cannot be double-booked by concurrent requests", async () => {
    const { ev, answers } = await setup({}, { capacity: 1 });
    const users = await Promise.all(Array.from({ length: 6 }, () => student()));
    const results = await Promise.all(users.map((u) => submitRegistration({ id: u.id, emailVerified: true }, ev.slug, answers)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await activeCount(ev.id)).toBe(1);
  });

  it("closed after the deadline, after the form's own cut-off, when disabled, when cancelled", async () => {
    const past = await setup({ registrationDeadline: toDateTimeLocal(future(1)), startAt: toDateTimeLocal(future(5)) });
    const s = await student();
    await db.event.update({ where: { id: past.ev.id }, data: { registrationDeadline: new Date(Date.now() - 1000) } });
    expect(await submitRegistration({ id: s.id, emailVerified: true }, past.ev.slug, past.answers)).toMatchObject({ ok: false, error: "closed" });

    const cut = await setup();
    await db.registrationForm.update({ where: { eventId: cut.ev.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    expect(await submitRegistration({ id: s.id, emailVerified: true }, cut.ev.slug, cut.answers)).toMatchObject({ ok: false, error: "closed" });

    const off = await setup();
    await db.registrationForm.update({ where: { eventId: off.ev.id }, data: { enabled: false } });
    expect((await submitRegistration({ id: s.id, emailVerified: true }, off.ev.slug, off.answers)).ok).toBe(false);

    const cancelled = await setup();
    await db.event.update({ where: { id: cancelled.ev.id }, data: { cancelled: true } });
    expect(await submitRegistration({ id: s.id, emailVerified: true }, cancelled.ev.slug, cancelled.answers)).toMatchObject({ ok: false, error: "closed" });
  });

  it("unpublished and external-link events cannot be registered for", async () => {
    const { orgUser, org } = await setup();
    const draft = await createEvent(orgUser, org.id, await eventInput({ title: "Hidden", registrationMode: "ON_PLATFORM" }));
    const ext = await createEvent(orgUser, org.id, await eventInput({ title: "External" }));
    const s = await student();
    expect((await submitRegistration({ id: s.id, emailVerified: true }, draft.slug, {})).ok).toBe(false);
    expect((await submitRegistration({ id: s.id, emailVerified: true }, ext.slug, {})).ok).toBe(false);
  });

  it("registration is rate limited per user", async () => {
    const { ev } = await setup();
    const s = await student();
    let last;
    for (let i = 0; i < 11; i++) last = await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, {});
    expect(last).toMatchObject({ ok: false, error: "tooMany" });
  });
});

describe("form ownership and data protection", () => {
  it("only the event's organizer (or staff) can build the form or read responses", async () => {
    const { ev, answers, orgUser, admin } = await setup();
    const s = await student();
    await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, answers);
    const rival = await makeUser("ORGANIZER");
    await makeOrganizer(rival.id);
    const input = formSchema.parse({ enabled: true, fields: [] });
    await expect(saveForm(rival, ev.id, input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(listRegistrations(rival, ev.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(exportRegistrationsCsv(rival, ev.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(listRegistrations(s, ev.id)).rejects.toMatchObject({ code: "forbidden" });
    expect((await listRegistrations(orgUser, ev.id)).rows).toHaveLength(1);
    expect((await listRegistrations(admin, ev.id)).rows).toHaveLength(1);
    const mod = await makeUser("MODERATOR");
    await expect(listRegistrations(mod, ev.id)).rejects.toMatchObject({ code: "forbidden" }); // moderators review content, they don't read participants' data
  });

  it("CSV export contains the answers, neutralises formulas, and is logged", async () => {
    const { ev, orgUser, fields } = await setup();
    const s = await student();
    await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, { [fields[0].id]: "=HYPERLINK(\"http://evil\")", [fields[1].id]: "Advanced" });
    const { csv, filename } = await exportRegistrationsCsv(orgUser, ev.id, "1.2.3.4");
    expect(filename).toBe(`${ev.slug}-registrations.csv`);
    expect(csv).toContain("School,Level");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split("\r\n")[1]).not.toMatch(/^[^,]*,[^,]*,[^,]*,[^,]*,=/);
    const log = await db.securityEvent.findFirstOrThrow({ where: { type: "registrations.exported" } });
    expect(log.actorId).toBe(orgUser.id);
    expect(JSON.stringify(log)).not.toContain("HYPERLINK");
  });

  it("form edits keep history readable and respect existing question ids", async () => {
    const { ev, orgUser, fields, answers } = await setup();
    const s = await student();
    await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, answers);
    await saveForm(orgUser, ev.id, formSchema.parse({ enabled: true, fields: [{ id: fields[0].id, type: "SHORT_TEXT", label: "University", required: true }] }));
    const after = (await loadForm(ev.id))!.fields;
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(fields[0].id);
    const row = await db.registration.findFirstOrThrow();
    expect((row.answers as { label: string }[]).map((a) => a.label)).toEqual(["School", "Level"]); // snapshot unchanged
  });

  it("another event's field ids cannot be hijacked through the builder", async () => {
    const a = await setup();
    const b = await setup({ title: "Second event" });
    await saveForm(b.orgUser, b.ev.id, formSchema.parse({ enabled: true, fields: [{ id: a.fields[0].id, type: "SHORT_TEXT", label: "Stolen id" }] }));
    expect((await loadForm(a.ev.id))!.fields.map((f) => f.label)).toContain("School"); // untouched
    expect((await loadForm(b.ev.id))!.fields.map((f) => f.label)).toEqual(["Stolen id"]); // created fresh
  });

  it("changing the registration method of a published event goes through review", async () => {
    const { ev, orgUser } = await setup();
    const res = await updateEvent(orgUser, ev.id, await eventInput({ title: "Integration Test Hackathon", registrationMode: "EXTERNAL", registrationUrl: "https://example.org/r" }));
    expect(res.queuedForReview).toBe(true);
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).registrationMode).toBe("ON_PLATFORM");
  });

  it("account export includes registrations; account deletion erases them", async () => {
    const { ev, answers } = await setup();
    const s = await student();
    await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, answers);
    const { deleteAccount, exportAccountData } = await import("@/lib/services/account");
    expect((await exportAccountData(s.id)).account.registrations).toHaveLength(1);
    expect(await deleteAccount(s.id)).toBe("ok");
    expect(await db.registration.count()).toBe(0); // answers are erased
    expect((await db.user.findUniqueOrThrow({ where: { id: s.id } })).email).toContain("deleted.invalid");
  });
});

describe("organizer review of registrations", () => {
  const verified = (id: string) => ({ id, emailVerified: true });

  it("with review enabled, registrations wait for a decision and still hold a seat", async () => {
    const { ev, answers } = await setup({}, { requireApproval: true, capacity: 1 });
    const [a, b] = [await student(), await student()];
    const r = await submitRegistration(verified(a.id), ev.slug, answers);
    expect(r).toMatchObject({ ok: true, status: "SUBMITTED" });
    expect((await db.registration.findFirstOrThrow({ where: { userId: a.id } })).status).toBe("SUBMITTED");
    expect(await submitRegistration(verified(b.id), ev.slug, answers)).toMatchObject({ ok: false, error: "full" });
    expect(await registrationCounts(ev.id)).toMatchObject({ pending: 1, approved: 0 });
    const email = await db.job.findFirstOrThrow({ where: { type: "email", payload: { path: ["subject"], string_contains: "received" } } });
    expect(JSON.stringify(email.payload)).toContain("decision");
  });

  it("approving notifies the student in-app and by email, and records who decided", async () => {
    const { ev, answers, orgUser } = await setup({}, { requireApproval: true });
    const s = await student();
    const r = await submitRegistration(verified(s.id), ev.slug, answers);
    if (!r.ok) throw new Error("setup");
    await decideRegistration(orgUser, r.registrationId, "APPROVED", "See you at the venue!");
    const reg = await db.registration.findUniqueOrThrow({ where: { id: r.registrationId } });
    expect(reg).toMatchObject({ status: "APPROVED", decidedById: orgUser.id, decisionNote: "See you at the venue!" });
    expect(reg.decidedAt).not.toBeNull();
    const n = await db.notification.findFirstOrThrow({ where: { userId: s.id, type: "REGISTRATION_APPROVED" }, include: { deliveries: true } });
    expect(n.title).toContain("you can participate");
    expect(n.body).toContain("/dashboard/registrations");
    expect(n.deliveries.map((d) => d.channel).sort()).toEqual(["EMAIL", "IN_APP"]);
    expect(await db.job.count({ where: { type: "notification-email" } })).toBe(1);
    expect((await myRegistrations(s.id))[0]).toMatchObject({ status: "APPROVED", decisionNote: "See you at the venue!" });
  });

  it("transactional decision emails are sent even if the student turned marketing email off", async () => {
    const { ev, answers, orgUser } = await setup({}, { requireApproval: true });
    const s = await student();
    await db.notificationPreference.update({ where: { userId: s.id }, data: { emailEnabled: false } });
    const r = await submitRegistration(verified(s.id), ev.slug, answers);
    if (!r.ok) throw new Error("setup");
    await decideRegistration(orgUser, r.registrationId, "REJECTED", "Open to final-year students only");
    const n = await db.notification.findFirstOrThrow({ where: { userId: s.id }, include: { deliveries: true } });
    expect(n.deliveries.map((d) => d.channel)).toContain("EMAIL");
  });

  it("rejection needs a reason, frees the seat, blocks re-registration and shows the reason", async () => {
    const { ev, answers, orgUser } = await setup({}, { requireApproval: true, capacity: 1 });
    const [a, b] = [await student(), await student()];
    const r = await submitRegistration(verified(a.id), ev.slug, answers);
    if (!r.ok) throw new Error("setup");
    await expect(decideRegistration(orgUser, r.registrationId, "REJECTED", "  ")).rejects.toMatchObject({ code: "invalidState" });
    await decideRegistration(orgUser, r.registrationId, "REJECTED", "Not eligible");
    expect(await activeCount(ev.id)).toBe(0); // seat is free again
    expect(await submitRegistration(verified(a.id), ev.slug, answers)).toMatchObject({ ok: false, error: "rejected" });
    expect((await submitRegistration(verified(b.id), ev.slug, answers)).ok).toBe(true);
    expect((await myRegistrations(a.id))[0]).toMatchObject({ status: "REJECTED", decisionNote: "Not eligible" });
    expect(await db.notification.count({ where: { userId: a.id, type: "REGISTRATION_REJECTED" } })).toBe(1);
  });

  it("changing a decision notifies again; repeating the same decision does not", async () => {
    const { ev, answers, orgUser } = await setup({}, { requireApproval: true });
    const s = await student();
    const r = await submitRegistration(verified(s.id), ev.slug, answers);
    if (!r.ok) throw new Error("setup");
    await decideRegistration(orgUser, r.registrationId, "APPROVED");
    await decideRegistration(orgUser, r.registrationId, "APPROVED"); // no change
    expect(await db.notification.count({ where: { userId: s.id } })).toBe(1);
    await decideRegistration(orgUser, r.registrationId, "REJECTED", "Capacity reduced by the venue");
    expect(await db.notification.count({ where: { userId: s.id } })).toBe(2);
  });

  it("only the event's organizer (or staff with event management) can decide; students and rivals cannot", async () => {
    const { ev, answers, admin } = await setup({}, { requireApproval: true });
    const s = await student();
    const r = await submitRegistration(verified(s.id), ev.slug, answers);
    if (!r.ok) throw new Error("setup");
    const rival = await makeUser("ORGANIZER"); await makeOrganizer(rival.id);
    const mod = await makeUser("MODERATOR");
    for (const who of [s, rival, mod]) await expect(decideRegistration(who, r.registrationId, "APPROVED")).rejects.toMatchObject({ code: "forbidden" });
    expect((await db.registration.findUniqueOrThrow({ where: { id: r.registrationId } })).status).toBe("SUBMITTED");
    await expect(decideRegistration(admin, r.registrationId, "APPROVED")).resolves.toMatchObject({ status: "APPROVED" });
    expect(await db.adminAuditLog.count({ where: { action: "registration.approved" } })).toBe(1);
  });

  it("withdrawn registrations cannot be decided; withdrawing an approved one frees the seat", async () => {
    const { ev, answers, orgUser } = await setup({}, { capacity: 1 });
    const s = await student();
    const r = await submitRegistration(verified(s.id), ev.slug, answers);
    if (!r.ok) throw new Error("setup");
    expect(await withdrawRegistration(s.id, ev.id)).toBe(true);
    expect(await activeCount(ev.id)).toBe(0);
    await expect(decideRegistration(orgUser, r.registrationId, "APPROVED")).rejects.toMatchObject({ code: "invalidState" });
  });

  it("CSV includes the status and the decision note", async () => {
    const { ev, answers, orgUser } = await setup({}, { requireApproval: true });
    const s = await student();
    const r = await submitRegistration(verified(s.id), ev.slug, answers);
    if (!r.ok) throw new Error("setup");
    await decideRegistration(orgUser, r.registrationId, "APPROVED", "Welcome");
    const { csv } = await exportRegistrationsCsv(orgUser, ev.id);
    expect(csv.split("\r\n")[0]).toContain("Decision note");
    expect(csv).toContain("APPROVED,Welcome");
  });
});

describe("profile edits", () => {
  it("the display name from the student profile becomes the account name used in registrations", async () => {
    const { ev, answers, orgUser } = await setup();
    const s = await student();
    await db.userProfile.upsert({ where: { userId: s.id }, update: { displayName: "Aye Chan" }, create: { userId: s.id, displayName: "Aye Chan" } });
    await db.user.update({ where: { id: s.id }, data: { name: "Aye Chan" } }); // what saveProfileAction does
    await submitRegistration({ id: s.id, emailVerified: true }, ev.slug, answers);
    const { rows } = await listRegistrations(orgUser, ev.id);
    expect(rows[0].user.name).toBe("Aye Chan");
  });
});
