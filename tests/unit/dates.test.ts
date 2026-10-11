import { describe, expect, it } from "vitest";
import { countdown, formatDateTime, fromDateTimeLocal, toDateTimeLocal, yangonDateKey, yangonParts } from "@/lib/dates";

describe("Myanmar Time (UTC+06:30)", () => {
  it("parses datetime-local input as Myanmar Time and stores UTC", () => {
    expect(fromDateTimeLocal("2026-11-20T09:00")!.toISOString()).toBe("2026-11-20T02:30:00.000Z");
  });
  it("round-trips UTC <-> Myanmar wall clock", () => {
    const d = new Date("2026-03-01T18:00:00Z"); // 00:30 next day in MMT
    expect(toDateTimeLocal(d)).toBe("2026-03-02T00:30");
    expect(fromDateTimeLocal(toDateTimeLocal(d))!.getTime()).toBe(d.getTime());
  });
  it("uses the Myanmar calendar day, not the UTC day", () => {
    expect(yangonDateKey(new Date("2026-03-01T18:00:00Z"))).toBe("2026-03-02");
    expect(yangonParts(new Date("2026-12-31T17:45:00Z"))).toMatchObject({ year: 2027, month: 1, day: 1, hour: 0, minute: 15 });
  });
  it("formats in Asia/Yangon for both locales", () => {
    expect(formatDateTime("2026-11-20T02:30:00Z", "en")).toContain("09:00");
    expect(formatDateTime("2026-11-20T02:30:00Z", "my")).toMatch(/[က-႟]/); // Burmese digits/month
  });
  it("rejects malformed input", () => {
    expect(fromDateTimeLocal("nope")).toBeNull();
    expect(fromDateTimeLocal("")).toBeNull();
  });
});

describe("countdown", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("computes remaining time", () => {
    expect(countdown(new Date("2026-01-03T05:30:00Z"), now)).toEqual({ expired: false, days: 2, hours: 5, minutes: 30 });
  });
  it("never reports an expired deadline as open", () => {
    expect(countdown(new Date("2025-12-31T23:59:59Z"), now).expired).toBe(true);
    expect(countdown(now, now).expired).toBe(true);
  });
});
