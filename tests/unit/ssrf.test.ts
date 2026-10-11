import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateIp } from "@/lib/ssrf";

describe("isPrivateIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1"])("blocks %s", (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe("assertPublicUrl", () => {
  it.each([
    "http://localhost/x", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://metadata.google.internal/", "http://[::1]/",
    "ftp://example.org/", "file:///etc/passwd", "https://user:pw@example.org/", "http://service.internal/", "http://foo.localhost/",
  ])("rejects %s", async (u) => { await expect(assertPublicUrl(u)).rejects.toThrow(); });
  it("accepts a public IP literal", async () => { await expect(assertPublicUrl("https://8.8.8.8/")).resolves.toBeInstanceOf(URL); });
});
