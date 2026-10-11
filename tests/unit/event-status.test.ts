import { describe, expect, it } from "vitest";
import { computeEventStatus, isRegistrationOpen, type StatusInput } from "@/lib/event-status";

const now = new Date("2026-06-01T00:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);
const base: StatusInput = { startAt: h(48), endAt: h(72), registrationDeadline: h(24), registrationUrl: "https://example.org/r", cancelled: false, registrationClosedOverride: false };

describe("computeEventStatus", () => {
  it("registration open before the deadline", () => expect(computeEventStatus(base, now)).toBe("REGISTRATION_OPEN"));
  it("registration closed after the deadline but before start", () => expect(computeEventStatus({ ...base, registrationDeadline: h(-1) }, now)).toBe("REGISTRATION_CLOSED"));
  it("closed by organizer override", () => expect(computeEventStatus({ ...base, registrationClosedOverride: true }, now)).toBe("REGISTRATION_CLOSED"));
  it("upcoming when there is no deadline and no registration link", () => expect(computeEventStatus({ ...base, registrationDeadline: null, registrationUrl: null }, now)).toBe("UPCOMING"));
  it("ongoing between start and end", () => expect(computeEventStatus({ ...base, startAt: h(-1), endAt: h(5) }, now)).toBe("ONGOING"));
  it("completed after end", () => expect(computeEventStatus({ ...base, startAt: h(-10), endAt: h(-1) }, now)).toBe("COMPLETED"));
  it("assumes a one-day duration when endAt is missing", () => {
    expect(computeEventStatus({ ...base, startAt: h(-2), endAt: null }, now)).toBe("ONGOING");
    expect(computeEventStatus({ ...base, startAt: h(-30), endAt: null }, now)).toBe("COMPLETED");
  });
  it("cancelled wins over everything", () => expect(computeEventStatus({ ...base, cancelled: true, startAt: h(-10), endAt: h(-1) }, now)).toBe("CANCELLED"));
  it("deadline exactly now is closed", () => expect(isRegistrationOpen({ ...base, registrationDeadline: now }, now)).toBe(false));
  it("open registration requires a link", () => expect(isRegistrationOpen({ ...base, registrationUrl: null }, now)).toBe(false));
});
