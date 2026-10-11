import { beforeEach, describe, expect, it } from "vitest";
import { jar } from "../../helpers/next-mocks";
import { createSession, getCurrentUser, getPendingMfaUser, rotateSession, revokeSessions, IDLE_DAYS } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/guards";
import { eventOpAction, userOpAction, verifyOrganizerAction, organizerOpAction, reviewSubmissionAction, killSwitchAction } from "@/app/actions/admin";
import { loginAction } from "@/app/actions/auth";
import { confirmMfaSetupAction, disableMfaAction, startMfaSetupAction, verifyMfaAction } from "@/app/actions/security";
import { base32Decode, decryptSecret, hotp, totpStep } from "@/lib/security/totp";
import { sha256 } from "@/lib/password";
import { createEvent, setPublishState, submitForReview } from "@/lib/services/events";
import { confirmEnrollment, beginEnrollment, verifySecondFactor } from "@/lib/services/mfa";
import { db, makeOrganizer, makeUser, resetDb } from "../../helpers/db";
import { eventInput } from "../../helpers/event-input";

beforeEach(async () => { jar.clear(); await resetDb(); });
const signIn = async (id: string, mfa = true) => { jar.clear(); await createSession(id, "vitest", { mfaVerified: mfa }); };
const codeFor = async (userId: string, stepOffset = 0) => hotp(base32Decode(decryptSecret((await db.mfaCredential.findUniqueOrThrow({ where: { userId } })).secretEnc)), totpStep() + stepOffset);

async function enrolled(role: "ADMIN" | "MODERATOR" | "SUPER_ADMIN" | "STUDENT" = "ADMIN") {
  const u = await makeUser(role);
  await beginEnrollment(u.id);
  const codes = await confirmEnrollment(u.id, await codeFor(u.id));
  return { u, codes: codes! };
}

describe("vertical privilege escalation", () => {
  it("students and organizers cannot reach any staff permission", async () => {
    for (const role of ["STUDENT", "ORGANIZER"] as const) {
      await signIn((await makeUser(role)).id);
      for (const p of ["admin.access", "review.submissions", "events.manage", "users.manage", "security.view", "admins.manage"] as const) await expect(assertPermission(p)).rejects.toThrow();
    }
  });
  it("only organizers receive event-submission authority; staff use review and management actions", async () => {
    for (const role of ["STUDENT", "MODERATOR", "ADMIN", "SUPER_ADMIN"] as const) {
      await signIn((await makeUser(role)).id);
      await expect(assertPermission("event.submit")).rejects.toThrow();
    }
    await signIn((await makeUser("ORGANIZER")).id);
    await expect(assertPermission("event.submit")).resolves.toBeTruthy();
  });
  it("a moderator cannot publish, delete, verify organizers, change roles, or flip emergency switches", async () => {
    const mod = await makeUser("MODERATOR");
    const target = await makeUser("STUDENT");
    const org = await makeOrganizer(); const ou = await makeUser("ORGANIZER");
    const ev = await createEvent(ou, (await makeOrganizer(ou.id)).id, await eventInput());
    await signIn(mod.id);
    expect(await eventOpAction(ev.id, "publish")).toMatchObject({ ok: false, error: "pages.forbiddenBody" });
    expect(await eventOpAction(ev.id, "delete")).toMatchObject({ ok: false });
    expect(await userOpAction(target.id, "ORGANIZER")).toMatchObject({ ok: false });
    expect(await verifyOrganizerAction(org.id, "MANUAL_ADMIN", "I looked at the website, it is fine")).toMatchObject({ ok: false });
    expect(await organizerOpAction(org.id, "suspend", "policy violation")).toMatchObject({ ok: false });
    expect(await killSwitchAction("automation_paused", true)).toMatchObject({ ok: false });
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).publishState).toBe("DRAFT");
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("STUDENT");
  });
  it("but a moderator CAN review submissions", async () => {
    const mod = await makeUser("MODERATOR"); const ou = await makeUser("ORGANIZER");
    const ev = await createEvent(ou, (await makeOrganizer(ou.id)).id, await eventInput());
    const sub = await submitForReview(ou, ev.id);
    await signIn(mod.id);
    expect(await reviewSubmissionAction(sub.id, "CHANGES_REQUESTED", "Please add the source")).toMatchObject({ ok: true });
  });
  it("an ADMIN cannot create admins or super admins, nor touch them; only a SUPER_ADMIN can", async () => {
    const admin = await makeUser("ADMIN"); const peer = await makeUser("ADMIN"); const sa = await makeUser("SUPER_ADMIN"); const student = await makeUser("STUDENT");
    await signIn(admin.id);
    expect(await userOpAction(student.id, "ADMIN")).toMatchObject({ ok: false });
    expect(await userOpAction(student.id, "SUPER_ADMIN")).toMatchObject({ ok: false });
    expect(await userOpAction(peer.id, "STUDENT")).toMatchObject({ ok: false });
    expect(await userOpAction(sa.id, "STUDENT")).toMatchObject({ ok: false });
    expect(await userOpAction(sa.id, "suspend")).toMatchObject({ ok: false });
    expect(await userOpAction(student.id, "MODERATOR")).toMatchObject({ ok: false });
    expect(await db.securityEvent.count({ where: { type: "authz.privilege_escalation_blocked", severity: "HIGH" } })).toBe(6);
    await signIn(sa.id);
    expect(await userOpAction(student.id, "MODERATOR")).toMatchObject({ ok: true });
    expect(await userOpAction(student.id, "ADMIN")).toMatchObject({ ok: true });
    const crit = await db.securityEvent.findFirstOrThrow({ where: { type: "role.changed", severity: "CRITICAL" } });
    expect(crit.actorId).toBe(sa.id);
    expect(await db.job.count({ where: { type: "security-alert" } })).toBeGreaterThan(0); // admin creation raises an alert
  });
  it("nobody changes their own role, even a super admin", async () => {
    const sa = await makeUser("SUPER_ADMIN");
    await signIn(sa.id);
    expect(await userOpAction(sa.id, "STUDENT")).toMatchObject({ ok: false, error: "admin.selfChange" });
    expect((await db.user.findUniqueOrThrow({ where: { id: sa.id } })).role).toBe("SUPER_ADMIN");
  });
  it("changing a user's role revokes their sessions (no stale authority)", async () => {
    const admin = await makeUser("ADMIN"); const t = await makeUser("STUDENT");
    await signIn(t.id);
    await signIn(admin.id);
    await userOpAction(t.id, "ORGANIZER");
    expect(await db.session.count({ where: { userId: t.id } })).toBe(0);
  });
  it("organizer applications cannot be approved for unverified emails; approval does not verify the organization", async () => {
    const admin = await makeUser("ADMIN");
    const applicant = await makeUser("STUDENT", { verified: true });
    const app = await db.organizerApplication.create({ data: { userId: applicant.id, name: "Fake University", type: "UNIVERSITY", description: "d", contactEmail: "x@fake.example" } });
    await signIn(admin.id);
    const { applicationDecisionAction } = await import("@/app/actions/admin");
    expect(await applicationDecisionAction(app.id, "APPROVED")).toMatchObject({ ok: true });
    const org = await db.organizer.findFirstOrThrow({ where: { name: "Fake University" } });
    expect(org.status).toBe("UNVERIFIED");
    expect(org.verifiedAt).toBeNull();
  });
  it("Verified Organizer needs a method and written evidence, records who/when, and can be revoked with a reason", async () => {
    const admin = await makeUser("ADMIN"); const org = await makeOrganizer();
    await signIn(admin.id);
    expect(await verifyOrganizerAction(org.id, "MANUAL_ADMIN", "short")).toMatchObject({ ok: false });
    expect(await verifyOrganizerAction(org.id, "LOGO_LOOKS_RIGHT", "a recognizable logo was uploaded")).toMatchObject({ ok: false });
    expect(await verifyOrganizerAction(org.id, "OFFICIAL_WEBSITE", "Confirmed via the contact page on uni.edu.mm, call back done")).toMatchObject({ ok: true });
    const v = await db.organizer.findUniqueOrThrow({ where: { id: org.id } });
    expect(v).toMatchObject({ status: "VERIFIED", verifiedById: admin.id, verificationMethod: "OFFICIAL_WEBSITE" });
    expect(await organizerOpAction(org.id, "revoke")).toMatchObject({ ok: false }); // reason required
    expect(await organizerOpAction(org.id, "revoke", "Domain ownership lapsed")).toMatchObject({ ok: true });
    expect(await db.organizer.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ status: "UNVERIFIED", verificationEvidence: null });
  });
});

describe("horizontal access (object-level ownership)", () => {
  it("an organizer cannot read or alter another organizer's submissions, form data or events", async () => {
    const a = await makeUser("ORGANIZER"); const b = await makeUser("ORGANIZER");
    const orgA = await makeOrganizer(a.id); await makeOrganizer(b.id);
    const ev = await createEvent(a, orgA.id, await eventInput());
    const { updateEvent, submitForReview: submit, setOverrides } = await import("@/lib/services/events");
    await expect(updateEvent(b, ev.id, await eventInput({ title: "Hijacked" }))).rejects.toMatchObject({ code: "forbidden" });
    await expect(submit(b, ev.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(setOverrides(b, ev.id, { cancelled: true })).rejects.toMatchObject({ code: "forbidden" });
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).title).not.toBe("Hijacked");
  });
  it("saved events, notifications and registrations are scoped to the session user", async () => {
    const a = await makeUser(); const b = await makeUser();
    const ou = await makeUser("ORGANIZER"); const admin = await makeUser("ADMIN");
    const ev = await createEvent(ou, (await makeOrganizer(ou.id)).id, await eventInput());
    await setPublishState(admin, ev.id, "PUBLISHED");
    await signIn(a.id);
    const { toggleSaveAction } = await import("@/app/actions/student");
    await toggleSaveAction(ev.id);
    expect(await db.savedEvent.count({ where: { userId: b.id } })).toBe(0);
    expect(await db.savedEvent.count({ where: { userId: a.id } })).toBe(1);
  });
});

describe("suspended and deleted accounts", () => {
  it("a suspended user is rejected immediately, including already-issued sessions", async () => {
    const admin = await makeUser("ADMIN"); const u = await makeUser("ORGANIZER");
    await signIn(u.id);
    expect(await getCurrentUser()).not.toBeNull();
    await signIn(admin.id);
    await userOpAction(u.id, "suspend");
    await signIn(u.id); // even if a session somehow existed
    await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect(await getCurrentUser()).toBeNull();
    await expect(assertPermission("event.submit")).rejects.toThrow();
  });
});

describe("two-factor authentication", () => {
  it("privileged logins stay unauthenticated until the second factor passes (no admin access with a password alone)", async () => {
    const { u } = await enrolled("ADMIN");
    await signIn(u.id, false); // password step only
    expect(await getCurrentUser()).toBeNull();
    expect((await getPendingMfaUser())?.id).toBe(u.id);
    await expect(assertPermission("admin.access")).rejects.toThrow();
    expect(await eventOpAction("00000000-0000-4000-8000-000000000000", "delete")).toMatchObject({ ok: false });
    expect(await verifyMfaAction("000000")).toMatchObject({ ok: false, error: "mfa.invalid" });
    expect(await verifyMfaAction(await codeFor(u.id, 1))).toMatchObject({ ok: true });
    expect((await getCurrentUser())?.id).toBe(u.id);
  });
  it("login redirects privileged users to enrol or verify; students are not forced", async () => {
    const admin = await makeUser("ADMIN", { email: "boss@test.example" });
    const r = await loginAction({ email: "boss@test.example", password: "password-1234" }, "/admin");
    expect(r.redirect).toBe("/auth/mfa/setup?next=%2Fadmin"); // not enrolled yet → must enrol
    jar.clear();
    await beginEnrollment(admin.id); await confirmEnrollment(admin.id, await codeFor(admin.id));
    const r2 = await loginAction({ email: "boss@test.example", password: "password-1234" }, "/admin");
    expect(r2.redirect).toBe("/auth/mfa?next=%2Fadmin");
    jar.clear();
    await makeUser("STUDENT", { email: "kid@test.example" });
    expect((await loginAction({ email: "kid@test.example", password: "password-1234" })).redirect).toBe("/dashboard");
  });
  it("an un-enrolled privileged user can enrol from the pending state, and the session token is rotated", async () => {
    const u = await makeUser("MODERATOR");
    await signIn(u.id, false);
    const before = jar.get("lte_session")!;
    const start = await startMfaSetupAction();
    expect(start.ok && start.data?.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(start.data?.qr).toContain("<svg");
    const r = await confirmMfaSetupAction(await codeFor(u.id));
    expect(r.ok).toBe(true);
    expect(r.data?.recoveryCodes).toHaveLength(10);
    expect(jar.get("lte_session")).not.toBe(before);
    expect(await db.session.count({ where: { tokenHash: sha256(before) } })).toBe(0); // old token dead
    expect((await getCurrentUser())?.id).toBe(u.id);
  });
  it("TOTP codes cannot be replayed", async () => {
    const { u } = await enrolled();
    const next = await codeFor(u.id, 1);
    expect(await verifySecondFactor(u.id, next)).toBe("ok");
    expect(await verifySecondFactor(u.id, next)).toBe("invalid");
  });
  it("recovery codes work once and are stored only as hashes", async () => {
    const { u, codes } = await enrolled();
    const stored = await db.mfaRecoveryCode.findMany({ where: { userId: u.id } });
    expect(stored).toHaveLength(10);
    expect(stored.some((s) => codes.includes(s.codeHash))).toBe(false);
    expect(await verifySecondFactor(u.id, codes[0])).toBe("ok");
    expect(await verifySecondFactor(u.id, codes[0])).toBe("invalid");
    expect(await verifySecondFactor(u.id, codes[1].toUpperCase())).toBe("ok");
  });
  it("MFA guessing is rate limited and raises a security event", async () => {
    const { u } = await enrolled();
    for (let i = 0; i < 5; i++) await verifySecondFactor(u.id, "000000");
    expect(await verifySecondFactor(u.id, await codeFor(u.id, 1))).toBe("limited"); // even a right code is refused while limited
    expect(await db.securityEvent.count({ where: { type: "mfa.rate_limited" } })).toBe(1);
  });
  it("secrets are encrypted at rest", async () => {
    const { u } = await enrolled();
    const c = await db.mfaCredential.findUniqueOrThrow({ where: { userId: u.id } });
    expect(c.secretEnc.startsWith("v1.")).toBe(true);
    expect(c.secretEnc).not.toMatch(/^[A-Z2-7]{32}$/);
  });
  it("privileged accounts cannot disable MFA; students can with their password", async () => {
    const { u: admin } = await enrolled("ADMIN");
    await signIn(admin.id);
    expect(await disableMfaAction("password-1234")).toMatchObject({ ok: false, error: "mfa.required" });
    const { u: student } = await enrolled("STUDENT");
    await signIn(student.id);
    expect(await disableMfaAction("wrong-password")).toMatchObject({ ok: false });
    expect(await disableMfaAction("password-1234")).toMatchObject({ ok: true });
    expect(await db.mfaCredential.count({ where: { userId: student.id } })).toBe(0);
  });
  it("a student who enrols voluntarily is challenged at next login", async () => {
    const { u } = await enrolled("STUDENT");
    await signIn(u.id, false);
    expect(await getCurrentUser()).toBeNull();
    expect((await getPendingMfaUser())?.id).toBe(u.id);
  });
});

describe("session lifecycle", () => {
  it("idle sessions expire after 7 days; absolute expiry is enforced", async () => {
    const u = await makeUser();
    await signIn(u.id);
    const s = await db.session.findFirstOrThrow({ where: { userId: u.id } });
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(Date.now() - (IDLE_DAYS + 1) * 86_400_000) } });
    expect(await getCurrentUser()).toBeNull();
    await signIn(u.id);
    await db.session.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getCurrentUser()).toBeNull();
  });
  it("sign out everywhere deletes every session; rotation invalidates the previous token", async () => {
    const u = await makeUser();
    for (let i = 0; i < 3; i++) await signIn(u.id);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(3);
    const old = jar.get("lte_session")!;
    await rotateSession({ mfaVerified: true });
    expect(await db.session.count({ where: { tokenHash: sha256(old) } })).toBe(0);
    await revokeSessions(u.id);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  });
  it("session tokens are stored hashed", async () => {
    const u = await makeUser(); await signIn(u.id);
    const token = jar.get("lte_session")!;
    expect(await db.session.findFirst({ where: { tokenHash: token } })).toBeNull();
    expect(await db.session.findFirst({ where: { tokenHash: sha256(token) } })).not.toBeNull();
  });
});
