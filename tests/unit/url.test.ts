import { describe, expect, it } from "vitest";
import { isSafeExternalUrl, normalizeUrl, safeRedirectPath } from "@/lib/url";

describe("normalizeUrl", () => {
  it("treats trivially different URLs as equal", () => {
    const a = normalizeUrl("https://www.Example.org/Event/?utm_source=fb&b=2&a=1#top");
    expect(a).toBe(normalizeUrl("http://example.org/Event?a=1&b=2"));
  });
  it("keeps meaningful query params and paths", () => {
    expect(normalizeUrl("https://example.org/e?id=1")).not.toBe(normalizeUrl("https://example.org/e?id=2"));
    expect(normalizeUrl("https://example.org/a")).not.toBe(normalizeUrl("https://example.org/b"));
  });
  it("rejects non-http(s) and garbage", () => {
    for (const bad of ["javascript:alert(1)", "ftp://x.org", "not a url", "", null, undefined]) expect(normalizeUrl(bad as string)).toBeNull();
  });
});

describe("isSafeExternalUrl", () => {
  it("allows plain http(s)", () => { expect(isSafeExternalUrl("https://example.org/x")).toBe(true); });
  it("blocks dangerous schemes and credentials", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://user:pw@example.org", "https://localhost"]) expect(isSafeExternalUrl(bad)).toBe(false);
  });
});

describe("safeRedirectPath (open redirect protection)", () => {
  it("allows same-site paths", () => expect(safeRedirectPath("/events?x=1")).toBe("/events?x=1"));
  it("blocks external and protocol-relative targets", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", ""]) expect(safeRedirectPath(bad)).toBe("/dashboard");
  });
});
