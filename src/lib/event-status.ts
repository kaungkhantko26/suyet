export type EventStatus =
  | "CANCELLED"
  | "COMPLETED"
  | "ONGOING"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "UPCOMING";

export interface StatusInput {
  startAt: Date;
  endAt: Date | null;
  registrationDeadline: Date | null;
  registrationUrl: string | null;
  cancelled: boolean;
  registrationClosedOverride: boolean;
}

/**
 * Single source of truth for the public status badge. Computed from stored dates
 * and admin/organizer overrides; never stored, so it can't go stale.
 *
 * Precedence: cancelled > completed > ongoing > registration state > upcoming.
 */
export function computeEventStatus(e: StatusInput, now: Date = new Date()): EventStatus {
  if (e.cancelled) return "CANCELLED";
  const end = e.endAt ?? new Date(e.startAt.getTime() + 24 * 3_600_000);
  if (now >= end) return "COMPLETED";
  if (now >= e.startAt) return "ONGOING";
  if (isRegistrationOpen(e, now)) return "REGISTRATION_OPEN";
  if (e.registrationDeadline || e.registrationClosedOverride) return "REGISTRATION_CLOSED";
  return "UPCOMING";
}

/** Registration is open only when a link exists, no override closes it, and the deadline hasn't passed. */
export function isRegistrationOpen(e: StatusInput, now: Date = new Date()): boolean {
  if (e.cancelled || e.registrationClosedOverride || !e.registrationUrl) return false;
  if (now >= e.startAt) return false;
  if (e.registrationDeadline && now >= e.registrationDeadline) return false;
  // Without a deadline we cannot claim it's open unless a link exists; the link existing is enough.
  return true;
}
