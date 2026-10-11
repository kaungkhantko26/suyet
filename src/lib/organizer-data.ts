import "server-only";
import { db } from "./db";
import { organizerIdsFor } from "./auth/guards";
import type { SessionUser } from "./auth/session";

export async function myOrganizers(user: SessionUser) {
  const ids = await organizerIdsFor(user);
  return db.organizer.findMany({ where: { deletedAt: null, ...(ids === "ALL" ? {} : { id: { in: ids } }) }, orderBy: { name: "asc" } });
}

export async function myEvents(user: SessionUser) {
  const ids = await organizerIdsFor(user);
  return db.event.findMany({
    where: { deletedAt: null, ...(ids === "ALL" ? {} : { organizerId: { in: ids } }) },
    include: {
      organizer: { select: { name: true } },
      submissions: { orderBy: { submittedAt: "desc" }, take: 1, include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}
export type MyEvent = Awaited<ReturnType<typeof myEvents>>[number];

/** The latest review state shown to organizers. Review status is separate from public lifecycle. */
export function submissionStatus(e: MyEvent): "DRAFT" | "PENDING_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" {
  return e.submissions[0]?.status ?? "DRAFT";
}
