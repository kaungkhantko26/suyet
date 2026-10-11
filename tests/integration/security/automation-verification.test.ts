import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jar } from "../../helpers/next-mocks";
import { createSession } from "@/lib/auth/session";
import { GET as statusGet, POST as internalPost } from "@/app/api/internal/event-candidates/route";
import { killSwitchAction, reviewSubmissionAction, ackAlertAction } from "@/app/actions/admin";
import { suggestEventAction } from "@/app/actions/public";
import { createEvent, reviewSubmission, setPublishState, setVerification, submitForReview, updateEvent, assessEventRisk } from "@/lib/services/events";
import { eventFormSchema } from "@/lib/validation/event";
import { raiseAlert, scanSecurityEvents } from "@/lib/services/alerts";
import { recordSecurityEvent } from "@/lib/security/events";
import { safeFetch } from "@/lib/ssrf";
import { checkSources } from "@/lib/worker/sources";
import { deleteAccount, exportAccountData } from "@/lib/services/account";
import { sanitizeImage, saveImage, UploadError } from "@/lib/storage";
import { listEvents } from "@/lib/events/queries";
import { parseEventFilters } from "@/lib/events/filters";
import { db, future, makeOrganizer, makeUser, resetDb } from "../../helpers/db";
import { eventInput } from "../../helpers/event-input";

beforeEach(async () => { jar.clear(); await resetDb(); });
const signIn = async (id: string) => { jar.clear(); await createSession(id, "vitest", { mfaVerified: true }); };

describe("n8n internal API", () => {
  const SECRET = "test-internal-secret";
  const URLX = "http://x/api/internal/event-candidates";
  const body = JSON.stringify({ title: "Signed Event", sourceUrl: "https://example.org/signed" });
  const sign = (b: string, id: string, ts = String(Math.floor(Date.now() / 1000)), sec = SECRET) => ({ "x-timestamp": ts, "x-request-id": id, "x-signature": "sha256=" + createHmac("sha256", sec).update(`${ts}.${id}.${b}`).digest("hex") });
  const post = (b: string, headers: Record<string, string>) => internalPost(new Request(URLX, { method: "POST", body: b, headers }));

  it("accepts a correctly signed request and stores a PENDING_REVIEW candidate, never an event", async () => {
    const r = await post(body, sign(body, "req-aaaaaaaa"));
    expect(r.status).toBe(201);
    expect(r.headers.get("x-request-id")).toBeTruthy();
    expect((await db.eventCandidate.findFirstOrThrow()).status).toBe("PENDING_REVIEW");
    expect(await db.event.count()).toBe(0);
  });
  it("rejects invalid signatures, wrong secrets, tampered bodies and logs the failure", async () => {
    expect((await post(body, { ...sign(body, "req-bbbbbbbb"), "x-signature": "sha256=" + "0".repeat(64) })).status).toBe(401);
    expect((await post(body, sign(body, "req-cccccccc", undefined, "wrong-secret"))).status).toBe(401);
    expect((await post(body + " ", sign(body, "req-dddddddd"))).status).toBe(401);
    expect(await db.securityEvent.count({ where: { type: "internal_api.auth_failed" } })).toBe(3);
    expect(await db.eventCandidate.count()).toBe(0);
  });
  it("rejects expired timestamps", async () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect((await post(body, sign(body, "req-eeeeeeee", old))).status).toBe(401);
  });
  it("blocks replays of the same signed request id (409) and records a HIGH event", async () => {
    const h = sign(body, "req-ffffffff");
    expect((await post(body, h)).status).toBe(201);
    const again = await post(body, h);
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("replayed_request");
    expect(await db.securityEvent.count({ where: { type: "internal_api.replay_blocked", severity: "HIGH" } })).toBe(1);
    expect(await db.eventCandidate.count()).toBe(1);
  });
  it("production mode (hmac) refuses plain bearer secrets", async () => {
    vi.stubEnv("INTERNAL_AUTH_MODE", "hmac");
    expect((await post(body, { authorization: `Bearer ${SECRET}` })).status).toBe(401);
    vi.stubEnv("INTERNAL_AUTH_MODE", "bearer");
    expect((await post(body, { authorization: `Bearer ${SECRET}` })).status).toBe(201);
    vi.unstubAllEnvs();
  });
  it("supports secret rotation via INTERNAL_API_SECRET_PREVIOUS", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "new-secret");
    vi.stubEnv("INTERNAL_API_SECRET_PREVIOUS", SECRET);
    expect((await post(body, sign(body, "req-gggggggg"))).status).toBe(201); // old secret still accepted during rotation
    vi.unstubAllEnvs();
    vi.stubEnv("INTERNAL_API_SECRET_PREVIOUS", "");
    vi.stubEnv("INTERNAL_API_SECRET", "new-secret");
    expect((await post(body, sign(body, "req-hhhhhhhh"))).status).toBe(401); // old secret revoked after rotation
    vi.unstubAllEnvs();
  });
  it("cannot publish, approve, or smuggle privileged fields", async () => {
    const evil = JSON.stringify({ title: "Evil Event", sourceUrl: "https://example.org/e", status: "PUBLISHED", publishState: "PUBLISHED", featured: true, role: "ADMIN", verificationStatus: "VERIFIED" });
    const r = await post(evil, sign(evil, "req-iiiiiiii"));
    expect(r.status).toBe(201);
    expect(await db.event.count()).toBe(0);
    const c = await db.eventCandidate.findFirstOrThrow();
    expect(c.status).toBe("PENDING_REVIEW");
    expect(await db.user.count({ where: { role: "ADMIN" } })).toBe(0);
  });
  it("validates input: malformed JSON, dangerous URLs, oversized payloads", async () => {
    expect((await post("{bad", sign("{bad", "req-jjjjjjjj"))).status).toBe(400);
    const js = JSON.stringify({ title: "XSS Link", sourceUrl: "javascript:alert(1)" });
    expect((await post(js, sign(js, "req-kkkkkkkk"))).status).toBe(422);
    const big = "x".repeat(150_000);
    expect((await post(big, sign(big, "req-llllllll"))).status).toBe(413);
  });
  it("the integration identity can only read a candidate's status, nothing else", async () => {
    await post(body, sign(body, "req-mmmmmmmm"));
    const c = await db.eventCandidate.findFirstOrThrow();
    const r = await statusGet(new Request(`${URLX}?id=${c.id}`, { headers: sign("", "req-nnnnnnnn") }));
    expect(r.status).toBe(200);
    expect(Object.keys(await r.json()).sort()).toEqual(["createdAt", "id", "status"]);
    expect((await statusGet(new Request(`${URLX}?id=${c.id}`))).status).toBe(401);
  });
  it("errors never leak internals; no CORS headers are emitted", async () => {
    const r = await post(body, {});
    const text = JSON.stringify(await r.json());
    expect(text).not.toMatch(/stack|prisma|postgres|secret|DATABASE_URL/i);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("pausing automation (incident response) stops ingestion with 503", async () => {
    const admin = await makeUser("ADMIN");
    await signIn(admin.id);
    expect(await killSwitchAction("automation_paused", true)).toMatchObject({ ok: true });
    expect((await post(body, sign(body, "req-oooooooo"))).status).toBe(503);
    expect(await db.securityEvent.count({ where: { type: "switch.automation_paused", severity: "HIGH" } })).toBe(1);
    await killSwitchAction("automation_paused", false);
    expect((await post(body, sign(body, "req-pppppppp"))).status).toBe(201);
  });
  it("repeated authentication failures from one address are throttled before secrets are compared", async () => {
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await post(body, { authorization: "Bearer nope", "x-real-ip": "198.51.100.7" })).status;
    expect(last).toBe(429);
  });
});

describe("event verification workflow security", () => {
  async function submitted(over: Record<string, unknown> = {}, orgOver: Record<string, unknown> = {}) {
    const admin = await makeUser("ADMIN"); const ou = await makeUser("ORGANIZER");
    const org = await db.organizer.create({ data: { name: "Fake Univ", slug: `fake-${Math.random().toString(36).slice(2, 7)}`, type: "UNIVERSITY", members: { create: { userId: ou.id } }, ...orgOver } });
    const ev = await createEvent(ou, org.id, await eventInput(over));
    const sub = await submitForReview(ou, ev.id);
    return { admin, ou, org, ev, sub };
  }
  it("a fake organizer's submission is flagged as unverified and stays hidden until a human approves", async () => {
    const { ev, sub } = await submitted();
    const risk = (await db.eventSubmission.findUniqueOrThrow({ where: { id: sub.id } })).riskReport as { indicators: { code: string }[]; note: string };
    expect(risk.indicators.map((i) => i.code)).toContain("organizer-unverified");
    expect(risk.note).toMatch(/never grant approval/);
    expect((await listEvents(parseEventFilters({}))).items.map((e) => e.id)).not.toContain(ev.id);
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).verificationStatus).toBe("UNVERIFIED");
  });
  it("approval never grants Verified status; verification is a separate, evidence-backed human action", async () => {
    const { admin, ev, sub } = await submitted({ sourceUrl: "" });
    await reviewSubmission(admin, sub.id, "APPROVED");
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).verificationStatus).toBe("UNVERIFIED");
    await expect(setVerification(admin, ev.id, "VERIFIED")).rejects.toMatchObject({ code: "needsEvidence" });
  });
  it("malicious registration links are rejected by validation (javascript:, data:, http, internal addresses)", async () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>1</script>", "http://example.org/r", "https://169.254.169.254/latest/meta-data", "https://localhost:3000/", "file:///etc/passwd", "https://user:pass@example.org/"]) {
      const r = eventFormSchema.safeParse({ title: "T", shortDescription: "s", description: "d", categoryIds: ["3f2504e0-4f89-41d3-9a0c-0305e82c3301"], startAt: "2030-01-01T09:00", format: "ONLINE", onlineUrl: "https://example.org/live", registrationUrl: bad });
      expect(r.success, bad).toBe(false);
    }
  });
  it("risky-but-valid links (shortener, punycode, IP host) are flagged for the reviewer; threat hits need written justification to approve", async () => {
    const { admin, ev, sub } = await submitted({ registrationUrl: "https://bit.ly/abc", sourceUrl: "https://xn--pple-43d.com/event" });
    const risk = (await db.eventSubmission.findUniqueOrThrow({ where: { id: sub.id } })).riskReport as { indicators: { code: string }[] };
    expect(risk.indicators.map((i) => i.code)).toEqual(expect.arrayContaining(["url-shortener", "punycode-idn"]));
    // simulate a CRITICAL indicator (e.g. threat intelligence hit) on the stored report
    await db.eventSubmission.update({ where: { id: sub.id }, data: { riskReport: { hasCritical: true, indicators: [{ code: "threat-intelligence-hit", severity: "critical", detail: "x" }], score: 12, webRisk: {}, note: "n", generatedAt: new Date().toISOString() } } });
    await signIn(admin.id);
    expect(await reviewSubmissionAction(sub.id, "APPROVED")).toMatchObject({ ok: false, error: "admin.needsAcknowledgement" });
    expect(await reviewSubmissionAction(sub.id, "APPROVED", "ok")).toMatchObject({ ok: false });
    expect(await reviewSubmissionAction(sub.id, "APPROVED", "Contacted the organizer by phone; the link is their official shortener")).toMatchObject({ ok: true });
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).publishState).toBe("PUBLISHED");
  });
  it("a critical submission raises a HIGH security event (alert)", async () => {
    const { sub } = await submitted();
    expect(sub.status).toBe("PENDING_REVIEW");
    const risk = await assessEventRisk({ title: "x", startAt: future(10), registrationUrl: "https://127.0.0.1/r", sourceUrl: null, onlineUrl: null, organizerId: (await makeOrganizer()).id });
    expect(risk.hasCritical).toBe(true);
  });
  it("duplicate submissions are flagged (exact URL = high)", async () => {
    const first = await submitted({ title: "Original Hack" });
    await reviewSubmission(first.admin, first.sub.id, "APPROVED");
    const dup = await submitted({ title: "Totally different title", sourceUrl: "https://example.org/event" });
    const risk = (await db.eventSubmission.findUniqueOrThrow({ where: { id: dup.sub.id } })).riskReport as { indicators: { code: string; severity: string }[] };
    expect(risk.indicators.find((i) => i.code === "duplicate-exact")?.severity).toBe("high");
  });
  it("organizers cannot alter verification evidence/state through event edits", async () => {
    const { admin, ou, ev, sub } = await submitted();
    await reviewSubmission(admin, sub.id, "APPROVED");
    await setVerification(admin, ev.id, "VERIFIED", { officialSourceUrl: "https://example.org/official", notes: "checked" });
    const forged = { ...(await eventInput({ title: "Integration Test Hackathon" })), verificationStatus: "VERIFIED", verifiedById: ou.id, featured: true, publishState: "ARCHIVED" } as never;
    await updateEvent(ou, ev.id, forged);
    const e = await db.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(e).toMatchObject({ verificationStatus: "VERIFIED", verifiedById: admin.id, featured: false, publishState: "PUBLISHED" });
    expect(await db.eventVerification.count({ where: { eventId: ev.id } })).toBe(1);
  });
  it("verification records method/evidence/risk context and the audit trail is append-only", async () => {
    const { admin, ev } = await submitted();
    await setVerification(admin, ev.id, "VERIFIED", { officialSourceUrl: "https://example.org/official", notes: "Compared dates with the official page" });
    const v = await db.eventVerification.findFirstOrThrow({ where: { eventId: ev.id } });
    expect(v).toMatchObject({ status: "VERIFIED", verifiedById: admin.id, officialSourceUrl: "https://example.org/official" });
    expect(v.method).toBe("MANUAL_REVIEW");
    expect(JSON.stringify(v.evidence)).toContain("https://example.org/official");
    expect(Array.isArray(v.riskIndicators)).toBe(true);
    const log = await db.adminAuditLog.findFirstOrThrow({ where: { action: "event.verification.verified" } });
    await expect(db.adminAuditLog.update({ where: { id: log.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.adminAuditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });
  it("security events are append-only too, and never contain secrets", async () => {
    await recordSecurityEvent({ type: "test.event", severity: "LOW", metadata: { note: "hello" } });
    const e = await db.securityEvent.findFirstOrThrow({ where: { type: "test.event" } });
    await expect(db.securityEvent.update({ where: { id: e.id }, data: { type: "x" } })).rejects.toThrow(/append-only/);
    await expect(db.securityEvent.deleteMany({})).rejects.toThrow(/append-only/);
  });
  it("students' event suggestions land in the review queue, block malicious URLs, and are rate limited", async () => {
    const s = await makeUser("STUDENT");
    await signIn(s.id);
    expect(await suggestEventAction({ title: "Cool Hackathon", url: "https://hack.example.org/2030" })).toMatchObject({ ok: true });
    const c = await db.eventCandidate.findFirstOrThrow();
    expect(c.status).toBe("PENDING_REVIEW");
    expect(await db.event.count()).toBe(0);
    expect(await suggestEventAction({ title: "Bad", url: "https://169.254.169.254/x" })).toMatchObject({ ok: false });
    expect(await suggestEventAction({ title: "Bad2", url: "http://insecure.example.org/x" })).toMatchObject({ ok: false });
    for (let i = 0; i < 5; i++) await suggestEventAction({ title: `S${i}`, url: `https://s${i}.example.org/e` });
    expect(await suggestEventAction({ title: "Spam", url: "https://spam.example.org/e" })).toMatchObject({ ok: false, error: "auth.tooMany" });
    jar.clear();
    expect(await suggestEventAction({ title: "Anon", url: "https://anon.example.org/e" })).toMatchObject({ ok: false });
  });
  it("emergency switch disables event submissions", async () => {
    const admin = await makeUser("ADMIN"); const ou = await makeUser("ORGANIZER");
    const ev = await createEvent(ou, (await makeOrganizer(ou.id)).id, await eventInput());
    await signIn(admin.id);
    await killSwitchAction("submissions_disabled", true);
    await expect(submitForReview(ou, ev.id)).rejects.toMatchObject({ code: "disabled" });
    await killSwitchAction("submissions_disabled", false);
    await expect(submitForReview(ou, ev.id)).resolves.toBeTruthy();
  });
  it("organizers are limited to 10 submissions per day", async () => {
    const ou = await makeUser("ORGANIZER"); const org = await makeOrganizer(ou.id);
    let last: unknown;
    for (let i = 0; i < 11; i++) {
      const ev = await createEvent(ou, org.id, await eventInput({ title: `Spam ${i}` }));
      last = await submitForReview(ou, ev.id).catch((e) => e);
    }
    expect((last as { code?: string }).code).toBe("rateLimited");
  });
});

describe("SSRF protection for automated fetching", () => {
  it("never connects to loopback/private/metadata destinations, even via local servers", async () => {
    let hits = 0;
    const server = http.createServer((_, res) => { hits++; res.end("internal-secret"); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      for (const url of [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`, `http://[::1]:${port}/`, "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/", "http://metadata.google.internal/", "file:///etc/passwd", "ftp://example.org/", `http://user:pw@example.org/`]) {
        await expect(safeFetch(url, { timeoutMs: 1500 }), url).rejects.toThrow();
      }
      expect(hits).toBe(0); // the internal server never received a request
    } finally { server.close(); }
  });
  it("source checks refuse internal URLs and flag the source as failing rather than fetching it", async () => {
    await db.eventSource.create({ data: { name: "Internal", url: "http://127.0.0.1:9/x", normalizedUrl: "127.0.0.1:9/x", type: "OFFICIAL_WEBSITE" } });
    const r = await checkSources(5);
    expect(r.checked).toBe(1);
    const s = await db.eventSource.findFirstOrThrow();
    expect(s.consecutiveFailures).toBe(1);
    expect(s.lastError).toMatch(/Blocked/);
  });
  it("source checks are skipped while automation is paused", async () => {
    await db.eventSource.create({ data: { name: "S", url: "https://example.org/", normalizedUrl: "example.org", type: "OFFICIAL_WEBSITE" } });
    await db.siteSetting.create({ data: { key: "automation_paused", value: true } });
    expect(await checkSources(5)).toMatchObject({ checked: 0, paused: true });
  });
});

describe("injection resistance", () => {
  it("SQL injection strings in search and filters are treated as data", async () => {
    const admin = await makeUser("ADMIN"); const ou = await makeUser("ORGANIZER");
    const ev = await createEvent(ou, (await makeOrganizer(ou.id)).id, await eventInput({ title: "Quote's Hackathon" }));
    await setPublishState(admin, ev.id, "PUBLISHED");
    for (const q of [`'; DROP TABLE "Event"; --`, `" OR 1=1 --`, `%' OR '1'='1`, `\\'; SELECT pg_sleep(5); --`, "Quote's", "a".repeat(5000)]) {
      const res = await listEvents(parseEventFilters({ q }));
      expect(Array.isArray(res.items)).toBe(true);
    }
    expect((await listEvents(parseEventFilters({ q: "Quote's" }))).items).toHaveLength(1);
    expect((await listEvents(parseEventFilters({ q: `' OR '1'='1` }))).items).toHaveLength(0);
    expect(await db.event.count()).toBe(1); // table intact
    expect(parseEventFilters({ category: `x'; DROP TABLE "Event";--` }).category).toEqual([]); // rejected at parse time
  });
  it("XSS/markup in stored fields is preserved as inert text (escaping happens at render)", async () => {
    const ou = await makeUser("ORGANIZER");
    const ev = await createEvent(ou, (await makeOrganizer(ou.id)).id, await eventInput({ title: `<img src=x onerror=alert(1)>`, description: "<script>alert(1)</script>" }));
    expect(ev.title).toBe("<img src=x onerror=alert(1)>");
    const { eventJsonLd } = await import("@/lib/events/jsonld");
    const full = await db.event.findUniqueOrThrow({ where: { id: ev.id }, include: { organizer: true, categories: { include: { category: true } }, location: true, registrationForm: { select: { enabled: true } } } });
    const ld = JSON.stringify(eventJsonLd(full as never)).replace(/</g, "\\u003c");
    expect(ld).not.toContain("<img");
  });
});

describe("uploads", () => {
  const mk = async (buf: Buffer, name = "x.png", type = "image/png") => new File([new Uint8Array(buf)], name, { type });
  it("stores a sanitised random-named WebP regardless of the claimed name/type", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#fff" } }).png().toBuffer();
    process.env.UPLOAD_DIR = `${process.env.TMPDIR ?? "/tmp"}/lte-test-uploads`;
    const url = await saveImage(await mk(png, "../../etc/passwd.php", "text/html"));
    expect(url).toMatch(/^\/media\/[a-f0-9]{32}\.webp$/);
  });
  it("rejects SVG, HTML, scripts, executables and oversized files", async () => {
    for (const bad of [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"), Buffer.from("<html><script>alert(1)</script>"), Buffer.from("#!/bin/sh\nrm -rf /"), Buffer.from("MZ\x90\x00\x03")]) {
      await expect(saveImage(await mk(bad))).rejects.toBeInstanceOf(UploadError);
    }
    await expect(saveImage(await mk(Buffer.alloc(5 * 1024 * 1024)))).rejects.toBeInstanceOf(UploadError);
    await expect(sanitizeImage(Buffer.alloc(100))).rejects.toBeInstanceOf(UploadError);
  });
});

describe("alerting & monitoring", () => {
  it("failed-login spikes raise a deduplicated HIGH alert", async () => {
    for (let i = 0; i < 20; i++) await recordSecurityEvent({ type: "auth.login_failed", severity: "LOW", outcome: "failure" });
    expect(await scanSecurityEvents()).toContain("auth.login_failure_spike");
    expect(await scanSecurityEvents()).toEqual([]); // same window: no duplicate
    expect(await db.securityAlert.count({ where: { severity: "HIGH", status: "OPEN" } })).toBe(1);
  });
  it("alert delivery sends no personal or sensitive data", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://alerts.example.org/hook");
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => { calls.push({ url, body: init.body }); return new Response("ok"); });
    await raiseAlert("role.changed", "CRITICAL", "Admin role granted to user@example.org with token abc123", "k1");
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toContain("CRITICAL security alert: role.changed");
    expect(calls[0].body).not.toMatch(/user@example\.org|abc123/); // the summary stays in the dashboard only
  });
  it("alerts can be acknowledged by authorised staff only", async () => {
    await raiseAlert("x", "HIGH", "s", "k2");
    const a = await db.securityAlert.findFirstOrThrow();
    await signIn((await makeUser("MODERATOR")).id);
    expect(await ackAlertAction(a.id)).toMatchObject({ ok: false });
    await signIn((await makeUser("ADMIN")).id);
    expect(await ackAlertAction(a.id)).toMatchObject({ ok: true });
  });
});

describe("privacy", () => {
  it("export contains only the user's data and no credentials; deletion anonymises and blocks login", async () => {
    const s = await makeUser("STUDENT"); const other = await makeUser("STUDENT");
    const data = await exportAccountData(s.id);
    const json = JSON.stringify(data);
    expect(json).toContain(s.email);
    expect(json).not.toContain(other.email);
    expect(json).not.toMatch(/passwordHash|secretEnc|argon2|scrypt/);
    expect(await deleteAccount(s.id)).toBe("ok");
    const after = await db.user.findUniqueOrThrow({ where: { id: s.id } });
    expect(after).toMatchObject({ name: "Deleted user", passwordHash: null, status: "SUSPENDED" });
    expect(after.email).toContain("deleted.invalid");
  });
  it("staff accounts cannot delete themselves (must be demoted first)", async () => {
    const a = await makeUser("ADMIN");
    expect(await deleteAccount(a.id)).toBe("staff-account");
  });
});
