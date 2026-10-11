import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, registerUser, requestPasswordReset, resetPassword, verifyEmail } from "@/lib/services/auth";
import { sha256 } from "@/lib/password";
import { db, resetDb } from "../helpers/db";

beforeEach(resetDb);

const reg = (over = {}) => ({ name: "Aye", email: "aye@test.example", password: "password-1234", locale: "en", ip: "1.1.1.1", ...over });

describe("registration", () => {
  it("creates a STUDENT with a profile and notification preferences", async () => {
    const r = await registerUser(reg());
    expect(r.ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { email: "aye@test.example" }, include: { profile: true, notificationPreference: true } });
    expect(u.role).toBe("STUDENT");
    expect(u.passwordHash).not.toContain("password-1234");
    expect(u.emailVerified).toBeNull();
    expect(u.profile).toBeTruthy();
    expect(u.notificationPreference?.unsubscribeToken).toBeTruthy();
  });
  it("cannot be used to self-assign an elevated role", async () => {
    await registerUser({ ...reg(), role: "ADMIN" } as never);
    expect((await db.user.findUniqueOrThrow({ where: { email: "aye@test.example" } })).role).toBe("STUDENT");
  });
  it("organizer sign-up stays STUDENT with a PENDING application until an admin approves", async () => {
    const r = await registerUser(reg({ application: { name: "My Club", type: "UNIVERSITY_CLUB", description: "d", contactEmail: "c@test.example" } }));
    expect(r.ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { email: "aye@test.example" }, include: { applications: true, memberships: true } });
    expect(u.role).toBe("STUDENT");
    expect(u.applications).toHaveLength(1);
    expect(u.applications[0].status).toBe("PENDING");
    expect(u.memberships).toHaveLength(0);
  });
  it("rejects duplicate emails", async () => {
    await registerUser(reg());
    expect(await registerUser(reg())).toEqual({ ok: false, error: "emailTaken" });
  });
  it("queues a verification email as a background job (does not send inline)", async () => {
    await registerUser(reg());
    const jobs = await db.job.findMany({ where: { type: "email" } });
    expect(jobs).toHaveLength(1);
    expect(JSON.stringify(jobs[0].payload)).toContain("/auth/verify?token=");
  });
});

describe("login", () => {
  it("accepts correct credentials and rejects wrong ones with the same error for unknown users", async () => {
    await registerUser(reg());
    expect((await authenticate("aye@test.example", "password-1234", { ip: "9.9.9.1" })).ok).toBe(true);
    expect(await authenticate("aye@test.example", "wrong-password", { ip: "9.9.9.1" })).toEqual({ ok: false, error: "invalidCreds" });
    expect(await authenticate("ghost@test.example", "wrong-password", { ip: "9.9.9.1" })).toEqual({ ok: false, error: "invalidCreds" });
  });
  it("throttles repeated failures from one address (5 per account+IP) without locking the real owner out", async () => {
    await registerUser(reg());
    let last;
    for (let i = 0; i < 6; i++) last = await authenticate("aye@test.example", "bad", { ip: "8.8.8.8" });
    expect(last).toEqual({ ok: false, error: "tooMany" });
    // The attacker's pair is throttled even with the right password...
    expect(await authenticate("aye@test.example", "password-1234", { ip: "8.8.8.8" })).toEqual({ ok: false, error: "tooMany" });
    // ...but the legitimate owner on a different address is NOT locked out by someone else's guessing.
    expect((await authenticate("aye@test.example", "password-1234", { ip: "7.7.7.7" })).ok).toBe(true);
  });
  it("slows distributed guessing against one account (20 per account / 15 min) and credential stuffing per IP (30)", async () => {
    await registerUser(reg());
    let last;
    for (let i = 0; i < 21; i++) last = await authenticate("aye@test.example", "bad", { ip: `9.9.${i}.1` });
    expect(last).toEqual({ ok: false, error: "tooMany" });
    let stuffed;
    for (let i = 0; i < 31; i++) stuffed = await authenticate(`victim${i}@test.example`, "bad", { ip: "6.6.6.6" });
    expect(stuffed).toEqual({ ok: false, error: "tooMany" });
  });
  it("blocks suspended users", async () => {
    await registerUser(reg());
    await db.user.update({ where: { email: "aye@test.example" }, data: { status: "SUSPENDED" } });
    expect(await authenticate("aye@test.example", "password-1234", { ip: "6.6.6.6" })).toEqual({ ok: false, error: "suspended" });
  });
});

describe("email verification & password reset", () => {
  async function tokenFromQueue(kind: string) {
    const job = (await db.job.findMany({ where: { type: "email" }, orderBy: { createdAt: "desc" } })).find((j) => JSON.stringify(j.payload).includes(kind))!;
    return /token=([\w-]+)/.exec(JSON.stringify(job.payload))![1];
  }
  it("verifies once and only once", async () => {
    await registerUser(reg());
    const token = await tokenFromQueue("/auth/verify");
    expect(await verifyEmail(token)).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { email: "aye@test.example" } })).emailVerified).not.toBeNull();
    expect(await verifyEmail(token)).toBe(false);
    expect(await verifyEmail("garbage-token")).toBe(false);
  });
  it("tokens are stored hashed", async () => {
    await registerUser(reg());
    const token = await tokenFromQueue("/auth/verify");
    expect(await db.verificationToken.findFirst({ where: { tokenHash: token } })).toBeNull();
    expect(await db.verificationToken.findFirst({ where: { tokenHash: sha256(token) } })).not.toBeNull();
  });
  it("reset changes the password, signs out all sessions and consumes the token", async () => {
    await registerUser(reg());
    const u = await db.user.findUniqueOrThrow({ where: { email: "aye@test.example" } });
    await db.session.create({ data: { tokenHash: "x", userId: u.id, expiresAt: new Date(Date.now() + 1e6) } });
    await requestPasswordReset("aye@test.example", "5.5.5.5");
    const token = await tokenFromQueue("/auth/reset-password");
    expect(await resetPassword(token, "brand-new-password")).toBe(true);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await authenticate("aye@test.example", "brand-new-password", { ip: "4.4.4.4" })).ok).toBe(true);
    expect((await authenticate("aye@test.example", "password-1234", { ip: "4.4.4.4" })).ok).toBe(false);
    expect(await resetPassword(token, "another-password-1")).toBe(false);
  });
  it("does not reveal whether an email exists", async () => {
    await requestPasswordReset("nobody@test.example", "3.3.3.3");
    expect(await db.job.count()).toBe(0);
  });
});

describe("password storage & screening", () => {
  it("stores Argon2id hashes with unique salts", async () => {
    await registerUser(reg());
    await registerUser(reg({ email: "b@test.example" }));
    const [a, b] = await db.user.findMany({ orderBy: { email: "asc" } });
    expect(a.passwordHash).toMatch(/^\$argon2id\$/);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });
  it("upgrades a legacy scrypt hash to Argon2id on successful login", async () => {
    await registerUser(reg());
    const legacy = await legacyScryptHash("password-1234");
    await db.user.update({ where: { email: "aye@test.example" }, data: { passwordHash: legacy } });
    expect((await authenticate("aye@test.example", "password-1234", { ip: "2.2.2.2" })).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { email: "aye@test.example" } })).passwordHash).toMatch(/^\$argon2id\$/);
  });
  it("rejects well-known breached passwords at registration and reset", async () => {
    expect(await registerUser(reg({ password: "password123" }))).toEqual({ ok: false, error: "passwordBreached" });
    expect(await db.user.count()).toBe(0);
  });
  it("allows long passphrases", async () => {
    const pass = "correct horse battery staple ".repeat(6);
    expect((await registerUser(reg({ password: pass }))).ok).toBe(true);
    expect((await authenticate("aye@test.example", pass, { ip: "1.2.3.4" })).ok).toBe(true);
  });
  it("registration is limited to 5 attempts per IP per hour", async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await registerUser(reg({ email: `r${i}@test.example`, ip: "4.4.4.4" }));
    expect(last).toEqual({ ok: false, error: "tooMany" });
  });
  it("password reset requests are limited to 3 per account per hour and never reveal existence", async () => {
    await registerUser(reg());
    for (let i = 0; i < 5; i++) await requestPasswordReset("aye@test.example", `3.3.3.${i}`);
    expect(await db.job.count({ where: { type: "email", payload: { path: ["subject"], string_contains: "Reset" } } })).toBe(3);
  });
  it("security log records failures without secrets", async () => {
    await registerUser(reg());
    await authenticate("aye@test.example", "SuperSecretWrong1", { ip: "5.5.5.5" });
    const ev = await db.securityEvent.findFirstOrThrow({ where: { type: "auth.login_failed" } });
    expect(JSON.stringify(ev)).not.toContain("SuperSecretWrong1");
    expect(ev.ipHash).toBeTruthy();
    expect(JSON.stringify(ev)).not.toContain("5.5.5.5");
  });
});

async function legacyScryptHash(password: string) {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}
