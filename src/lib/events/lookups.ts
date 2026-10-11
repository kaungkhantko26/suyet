import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { publicWhere } from "./queries";

export const getCategories = unstable_cache(
  async () => db.eventCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ["categories"],
  { revalidate: 300, tags: ["categories"] },
);

export const getLocations = unstable_cache(
  async () => db.location.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ["locations"],
  { revalidate: 3600, tags: ["locations"] },
);

export async function getSavedIds(userId: string | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db.savedEvent.findMany({ where: { userId }, select: { eventId: true } });
  return new Set(rows.map((r) => r.eventId));
}

/** Real counts of upcoming published events per location slug (no fabricated numbers). */
export async function upcomingCountByLocation(): Promise<Record<string, number>> {
  const now = new Date();
  const rows = await db.event.groupBy({
    by: ["locationId"],
    where: { ...publicWhere, cancelled: false, OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }] },
    _count: { _all: true },
  });
  const locs = await getLocations();
  const bySlug: Record<string, number> = {};
  for (const r of rows) {
    const l = locs.find((x) => x.id === r.locationId);
    if (l) bySlug[l.slug] = r._count._all;
  }
  return bySlug;
}

export async function getOrganizerOptions() {
  return db.organizer.findMany({ where: { deletedAt: null, status: { not: "SUSPENDED" }, events: { some: publicWhere } }, orderBy: { name: "asc" }, select: { slug: true, name: true } });
}
