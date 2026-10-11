import { beforeEach, describe, expect, it } from "vitest";
import { jar } from "../helpers/next-mocks";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth/session";
import { toggleSaveAction, savePreferencesAction } from "@/app/actions/student";
import { loginAction, registerAction, registerOrganizerAction } from "@/app/actions/auth";
import { applicationDecisionAction, eventOpAction, userOpAction } from "@/app/actions/admin";
import { saveEventAction } from "@/app/actions/organizer";
import { createEvent, setPublishState } from "@/lib/services/events";
import { db, categoryIds, makeOrganizer, makeUser, resetDb } from "../helpers/db";
import { eventInput } from "../helpers/event-input";

beforeEach(async () => { jar.clear(); await resetDb(); });
const signInAs = async (userId: string) => { jar.clear(); await createSession(userId, "vitest", { mfaVerified: true }); };

async function publishedEvent() {
  const admin = await makeUser("ADMIN");
  const ou = await makeUser("ORGANIZER");
  const org = await makeOrganizer(ou.id);
  const ev = await createEvent(ou, org.id, await eventInput());
  await setPublishState(admin, ev.id, "PUBLISHED");
  return { admin, ou, org, ev };
}

describe("sessions", () => {
  it("stores only a hash and resolves the user from the cookie; logout destroys it", async () => {
    const u = await makeUser();
    await createSession(u.id, "vitest", { mfaVerified: true });
    const token = jar.get("lte_session")!;
    expect((await db.session.findMany()).some((s) => s.tokenHash === token)).toBe(false);
    expect((await getCurrentUser())?.id).toBe(u.id);
    await destroySession();
    expect(await getCurrentUser()).toBeNull();
    expect(await db.session.count()).toBe(0);
  });
  it("suspended users lose access immediately", async () => {
    const u = await makeUser();
    await signInAs(u.id);
    await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("auth actions", () => {
  it("register creates a student session; role cannot be injected", async () => {
    const r = await registerAction({ name: "New", email: "new@test.example", password: "password-1234", role: "ADMIN" });
    expect(r).toMatchObject({ ok: true, redirect: "/dashboard?welcome=1" });
    expect((await getCurrentUser())?.role).toBe("STUDENT");
  });
  it("organizer sign-up yields a student account + pending application (no organizer access yet)", async () => {
    const r = await registerOrganizerAction({ name: "Org Person", email: "orgp@test.example", password: "password-1234", orgName: "Cool Club", orgType: "UNIVERSITY_CLUB", orgDescription: "We run events", orgEmail: "club@test.example" });
    expect(r.ok).toBe(true);
    expect((await getCurrentUser())?.role).toBe("STUDENT");
    const app = await db.organizerApplication.findFirstOrThrow({ include: { user: true } });
    expect(app).toMatchObject({ name: "Cool Club", status: "PENDING" });
  });
  it("login validates input and sanitises the redirect target", async () => {
    await makeUser("STUDENT", { email: "s@test.example" });
    expect((await loginAction({ email: "bad", password: "x" })).fieldErrors).toBeTruthy();
    expect(await loginAction({ email: "s@test.example", password: "password-1234" }, "https://evil.com")).toMatchObject({ ok: true, redirect: "/dashboard" });
    expect(await loginAction({ email: "s@test.example", password: "password-1234" }, "/events")).toMatchObject({ redirect: "/events" });
  });
});

describe("student saves an event", () => {
  it("requires login", async () => {
    const { ev } = await publishedEvent();
    jar.clear();
    expect(await toggleSaveAction(ev.id)).toEqual({ error: "auth" });
  });
  it("toggles save/unsave and persists", async () => {
    const { ev } = await publishedEvent();
    const s = await makeUser();
    await signInAs(s.id);
    expect(await toggleSaveAction(ev.id)).toEqual({ saved: true });
    expect(await db.savedEvent.count({ where: { userId: s.id } })).toBe(1);
    expect(await db.analyticsEvent.count({ where: { type: "SAVE" } })).toBe(1);
    expect(await toggleSaveAction(ev.id)).toEqual({ saved: false });
    expect(await db.savedEvent.count()).toBe(0);
  });
  it("cannot save unpublished events", async () => {
    const { ou, org } = await publishedEvent();
    const draft = await createEvent(ou, org.id, await eventInput({ title: "Hidden draft" }));
    const s = await makeUser();
    await signInAs(s.id);
    expect(await toggleSaveAction(draft.id)).toEqual({ error: "notFound" });
  });
});

describe("notification preferences", () => {
  it("saves interests and channel settings, ignoring unknown categories", async () => {
    const s = await makeUser();
    await signInAs(s.id);
    const ids = await categoryIds("hackathons", "ctf");
    const r = await savePreferencesAction({ categoryIds: [...ids, "3f2504e0-4f89-41d3-9a0c-0305e82c3301"], locationSlugs: ["yangon"], onlineOnly: true, deadlineReminders: false, newEventAlerts: true, emailEnabled: false, inAppEnabled: true });
    expect(r.ok).toBe(true);
    expect((await db.userInterest.findMany({ where: { userId: s.id } })).map((i) => i.categoryId).sort()).toEqual([...ids].sort());
    expect(await db.notificationPreference.findUniqueOrThrow({ where: { userId: s.id } })).toMatchObject({ onlineOnly: true, deadlineReminders: false, emailEnabled: false, locationSlugs: ["yangon"] });
  });
  it("rejects anonymous callers", async () => {
    jar.clear();
    expect((await savePreferencesAction({ categoryIds: [], locationSlugs: [], onlineOnly: false, deadlineReminders: true, newEventAlerts: true, emailEnabled: true, inAppEnabled: true })).ok).toBe(false);
  });
});

describe("role-based permissions on server actions", () => {
  it("students and organizers cannot call admin actions", async () => {
    const { ev } = await publishedEvent();
    const target = await makeUser();
    for (const role of ["STUDENT", "ORGANIZER"] as const) {
      await signInAs((await makeUser(role)).id);
      expect(await eventOpAction(ev.id, "delete")).toMatchObject({ ok: false, error: "pages.forbiddenBody" });
      expect(await userOpAction(target.id, "ADMIN")).toMatchObject({ ok: false });
      expect(await applicationDecisionAction(target.id, "APPROVED")).toMatchObject({ ok: false });
    }
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).deletedAt).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("STUDENT");
  });
  it("students cannot call organizer actions; anonymous cannot either", async () => {
    const fd = new FormData();
    fd.set("data", JSON.stringify({}));
    await signInAs((await makeUser("STUDENT")).id);
    expect(await saveEventAction(fd)).toMatchObject({ ok: false, error: "pages.forbiddenBody" });
    jar.clear();
    expect(await saveEventAction(fd)).toMatchObject({ ok: false });
  });
  it("admin approves an organizer application: user becomes ORGANIZER with an organizer profile", async () => {
    await registerOrganizerAction({ name: "Org Person", email: "orgp@test.example", password: "password-1234", orgName: "Cool Club", orgType: "UNIVERSITY_CLUB", orgDescription: "We run events", orgEmail: "club@test.example" });
    const app = await db.organizerApplication.findFirstOrThrow();
    const admin = await makeUser("ADMIN");
    await signInAs(admin.id);
    // An applicant who has not verified their email cannot be approved.
    expect(await applicationDecisionAction(app.id, "APPROVED")).toMatchObject({ ok: false, error: "admin.emailNotVerified" });
    await db.user.update({ where: { id: app.userId }, data: { emailVerified: new Date() } });
    expect(await applicationDecisionAction(app.id, "APPROVED")).toMatchObject({ ok: true });
    const u = await db.user.findUniqueOrThrow({ where: { id: app.userId }, include: { memberships: { include: { organizer: true } } } });
    expect(u.role).toBe("ORGANIZER");
    expect(u.memberships[0].organizer).toMatchObject({ name: "Cool Club", status: "UNVERIFIED" });
  });
  it("admins cannot demote or suspend themselves", async () => {
    const admin = await makeUser("ADMIN");
    await signInAs(admin.id);
    expect(await userOpAction(admin.id, "STUDENT")).toMatchObject({ ok: false, error: "admin.selfChange" });
    expect(await userOpAction(admin.id, "suspend")).toMatchObject({ ok: false });
  });
  it("suspending a user ends their sessions", async () => {
    const admin = await makeUser("ADMIN");
    const victim = await makeUser();
    await signInAs(victim.id);
    await signInAs(admin.id);
    await userOpAction(victim.id, "suspend");
    expect(await db.session.count({ where: { userId: victim.id } })).toBe(0);
  });
});
