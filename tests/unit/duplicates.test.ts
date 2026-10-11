import { describe, expect, it } from "vitest";
import { findDuplicates, titleSimilarity } from "@/lib/events/duplicates";

const existing = [
  { id: "a", title: "Yangon Student Hackathon 2026", organizerName: "Demo Uni", sourceUrl: "https://example.org/hack", registrationUrl: "https://example.org/hack/register", startAt: new Date("2026-11-20T02:30:00Z") },
  { id: "b", title: "Completely Different Workshop", organizerName: "Other", sourceUrl: "https://other.org/ws", registrationUrl: null, startAt: new Date("2027-03-01T00:00:00Z") },
];

describe("findDuplicates", () => {
  it("exact match on normalized source URL", () => {
    const m = findDuplicates({ title: "Anything", sourceUrl: "http://www.example.org/hack/?utm_campaign=x" }, existing);
    expect(m[0]).toMatchObject({ id: "a", confidence: "EXACT" });
    expect(m[0].reasons).toContain("same-source-url");
  });
  it("exact match on registration URL", () => {
    expect(findDuplicates({ title: "x", registrationUrl: "https://example.org/hack/register#frag" }, existing)[0].confidence).toBe("EXACT");
  });
  it("flags similar title on the same day as POSSIBLE, never EXACT", () => {
    const m = findDuplicates({ title: "Student Hackathon Yangon", startAt: new Date("2026-11-20T05:00:00Z"), organizerName: "demo uni" }, existing);
    expect(m).toHaveLength(1);
    expect(m[0].confidence).toBe("POSSIBLE");
  });
  it("does not flag unrelated events", () => {
    expect(findDuplicates({ title: "Robotics Expo", sourceUrl: "https://new.org/r", startAt: new Date("2026-08-01T00:00:00Z") }, existing)).toEqual([]);
  });
  it("title similarity ignores year and punctuation", () => {
    expect(titleSimilarity("Hack-Fest 2026!", "hack fest 2027")).toBe(1);
  });
});
