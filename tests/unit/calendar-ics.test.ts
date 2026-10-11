import { describe, expect, it } from "vitest";
import { addDays, addMonths, monthGrid, parseCalParams, viewRange, weekDays } from "@/lib/calendar";
import { buildIcs } from "@/lib/ics";

describe("calendar math", () => {
  it("builds full Sun–Sat weeks for a month", () => {
    const g = monthGrid("2026-10-15");
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0][0]).toBe("2026-09-27");
    expect(g.flat()).toContain("2026-10-31");
  });
  it("navigates months and days across year boundaries", () => {
    expect(addMonths("2026-12-10", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-10", -1)).toBe("2025-12-01");
    expect(addDays("2026-02-27", 3)).toBe("2026-03-02");
    expect(weekDays("2026-10-14")[0]).toBe("2026-10-11");
  });
  it("view ranges start at Myanmar midnight", () => {
    expect(viewRange("week", "2026-10-14").from.toISOString()).toBe("2026-10-10T17:30:00.000Z");
  });
  it("sanitises params", () => {
    expect(parseCalParams({ view: "x", date: "garbage", category: "Bad!" }, new Date("2026-05-05T00:00:00Z"))).toEqual({ view: "month", date: "2026-05-05", category: undefined });
  });
});

describe("ICS export", () => {
  const ics = buildIcs({ uid: "u1", title: "Hack; Fest, 2026", description: "Line1\nLine2", startAt: new Date("2026-11-20T02:30:00Z"), endAt: new Date("2026-11-21T02:30:00Z"), location: "Yangon" }, new Date("2026-01-01T00:00:00Z"));
  it("emits UTC timestamps and CRLF", () => {
    expect(ics).toContain("DTSTART:20261120T023000Z");
    expect(ics).toContain("\r\n");
  });
  it("escapes special characters", () => {
    expect(ics).toContain("SUMMARY:Hack\; Fest\\, 2026");
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2");
  });
  it("folds long lines at 75 octets", () => {
    const long = buildIcs({ uid: "u", title: "x".repeat(200), startAt: new Date(), endAt: null });
    expect(long.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});
