import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { detectImage } from "@/lib/storage";
import { parseFormat, verifyInternalAuth } from "@/lib/services/candidates";
import { robotsAllows } from "@/lib/worker/sources";

describe("password hashing", () => {
  it("verifies correct and rejects wrong passwords; salts are unique", async () => {
    const h1 = await hashPassword("correct horse battery");
    const h2 = await hashPassword("correct horse battery");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("correct horse battery", h1)).toBe(true);
    expect(await verifyPassword("wrong", h1)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});

describe("upload sniffing", () => {
  it("accepts real PNG/JPEG/WebP signatures only", () => {
    expect(detectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))?.mime).toBe("image/png");
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(detectImage(Buffer.from("RIFF0000WEBPVP8 "))?.mime).toBe("image/webp");
  });
  it("rejects scripts/SVG/HTML disguised as images", () => {
    for (const s of ["<svg onload=alert(1)>", "<html><script>", "GIF89a", "MZ\x90\x00"]) expect(detectImage(Buffer.from(s))).toBeNull();
  });
});

describe("internal API auth", () => {
  const secret = "s3cret", body = '{"a":1}';
  const h = (o: Record<string, string>) => new Headers(o);
  const sign = (ts: string, id: string, b = body, sec = secret) => "sha256=" + createHmac("sha256", sec).update(`${ts}.${id}.${b}`).digest("hex");
  it("accepts bearer when the mode allows it; rejects wrong/missing", () => {
    expect(verifyInternalAuth(h({ authorization: "Bearer s3cret" }), body, secret)).toMatchObject({ ok: true, kind: "bearer" });
    expect(verifyInternalAuth(h({ authorization: "Bearer nope" }), body, secret)).toMatchObject({ ok: false });
    expect(verifyInternalAuth(h({}), body, secret)).toMatchObject({ ok: false, reason: "missing" });
    expect(verifyInternalAuth(h({ authorization: "Bearer s3cret" }), body, undefined)).toMatchObject({ ok: false, reason: "no-secret" });
  });
  it("hmac-only mode refuses bearer secrets", () => {
    expect(verifyInternalAuth(h({ authorization: "Bearer s3cret" }), body, secret, { mode: "hmac" })).toMatchObject({ ok: false, reason: "mode-disabled" });
  });
  it("accepts a fresh signature over timestamp + request id + exact body", () => {
    const now = Date.now(), ts = String(Math.floor(now / 1000)), id = "req-12345678";
    expect(verifyInternalAuth(h({ "x-timestamp": ts, "x-request-id": id, "x-signature": sign(ts, id) }), body, secret, { now, mode: "hmac" })).toMatchObject({ ok: true, kind: "hmac", requestId: id });
  });
  it("rejects tampered body, tampered request id, wrong secret and stale timestamps", () => {
    const now = Date.now(), ts = String(Math.floor(now / 1000)), id = "req-12345678";
    const base = { "x-timestamp": ts, "x-request-id": id, "x-signature": sign(ts, id) };
    expect(verifyInternalAuth(h(base), '{"a":2}', secret, { now })).toMatchObject({ ok: false, reason: "bad-signature" });
    expect(verifyInternalAuth(h({ ...base, "x-request-id": "req-99999999" }), body, secret, { now })).toMatchObject({ ok: false, reason: "bad-signature" });
    expect(verifyInternalAuth(h(base), body, "other", { now })).toMatchObject({ ok: false, reason: "bad-signature" });
    expect(verifyInternalAuth(h(base), body, secret, { now: now + 10 * 60_000 })).toMatchObject({ ok: false, reason: "expired" });
  });
  it("supports secret rotation (current + previous)", () => {
    const now = Date.now(), ts = String(Math.floor(now / 1000)), id = "req-12345678";
    const h2 = h({ "x-timestamp": ts, "x-request-id": id, "x-signature": sign(ts, id, body, "old-secret") });
    expect(verifyInternalAuth(h2, body, ["new-secret", "old-secret"], { now })).toMatchObject({ ok: true });
  });
});

describe("candidate helpers", () => {
  it("parses formats", () => {
    expect(parseFormat("Online")).toBe("ONLINE");
    expect(parseFormat("On-site")).toBe("ONSITE");
    expect(parseFormat("In person")).toBe("ONSITE");
    expect(parseFormat("???")).toBeNull();
  });
});

describe("robots.txt", () => {
  it("respects Disallow for our agent and *", () => {
    const txt = "User-agent: *\nDisallow: /private\n\nUser-agent: other\nDisallow: /";
    expect(robotsAllows(txt, "/private/x")).toBe(false);
    expect(robotsAllows(txt, "/events")).toBe(true);
    expect(robotsAllows("User-agent: LetsTechEventsBot\nDisallow: /", "/x")).toBe(false);
  });
});
