import { describe, expect, it } from "vitest";
import { changedSubstantialFields, eventFormSchema, parseSchedule } from "@/lib/validation/event";
import { registerSchema, loginSchema } from "@/lib/validation/auth";

const valid = {
  title: "Test Hackathon", shortDescription: "Short", description: "Long description",
  categoryIds: ["3f2504e0-4f89-41d3-9a0c-0305e82c3301"], startAt: "2027-01-10T09:00", format: "ONLINE", onlineUrl: "https://example.org/live",
};

describe("eventFormSchema", () => {
  it("accepts a minimal online event and interprets dates as Myanmar Time", () => {
    const r = eventFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.startAt!.toISOString()).toBe("2027-01-10T02:30:00.000Z");
  });
  it("requires a category", () => {
    const r = eventFormSchema.safeParse({ ...valid, categoryIds: [] });
    expect(r.success).toBe(false);
  });
  it("rejects end before start and deadline after start", () => {
    expect(eventFormSchema.safeParse({ ...valid, endAt: "2027-01-10T08:00" }).error?.issues[0].message).toBe("validation.dateOrder");
    expect(eventFormSchema.safeParse({ ...valid, registrationDeadline: "2027-01-11T08:00" }).error?.issues[0].message).toBe("validation.deadlineOrder");
  });
  it("rejects unsafe URLs", () => {
    expect(eventFormSchema.safeParse({ ...valid, registrationUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...valid, sourceUrl: "ftp://x.org" }).success).toBe(false);
  });
  it("validates team sizes", () => {
    expect(eventFormSchema.safeParse({ ...valid, teamAllowed: "on", minTeamSize: "4", maxTeamSize: "2" }).error?.issues[0].message).toBe("validation.teamOrder");
  });
  it("requires a place for on-site events but not online ones", () => {
    expect(eventFormSchema.safeParse({ ...valid, format: "ONSITE", onlineUrl: "" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...valid, format: "ONSITE", onlineUrl: "", city: "Yangon" }).success).toBe(true);
  });
  it("rejects negative fees", () => { expect(eventFormSchema.safeParse({ ...valid, feeAmount: "-1" }).success).toBe(false); });
});

describe("helpers", () => {
  it("parses schedule lines", () => {
    expect(parseSchedule("09:00 | Opening\nLunch")).toEqual([{ time: "09:00", title: "Opening" }, { time: "", title: "Lunch" }]);
  });
  it("detects substantial changes only", () => {
    const before = { title: "A", description: "x", startAt: new Date("2027-01-01"), registrationUrl: "u" };
    expect(changedSubstantialFields(before, { ...before, description: "changed" })).toEqual([]);
    expect(changedSubstantialFields(before, { ...before, startAt: new Date("2027-01-02") })).toEqual(["startAt"]);
    expect(changedSubstantialFields(before, { ...before, registrationUrl: "v", title: "B" }).sort()).toEqual(["registrationUrl", "title"]);
  });
});

describe("auth schemas", () => {
  it("normalises email and enforces password length", () => {
    expect(registerSchema.parse({ name: "A", email: " A@B.CO ", password: "0123456789" }).email).toBe("a@b.co");
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "short" }).success).toBe(false);
  });
  it("ignores a client-supplied role", () => {
    expect((registerSchema.parse({ name: "A", email: "a@b.co", password: "0123456789", role: "ADMIN" }) as Record<string, unknown>).role).toBeUndefined();
    expect(loginSchema.safeParse({ email: "bad", password: "x" }).success).toBe(false);
  });
});
