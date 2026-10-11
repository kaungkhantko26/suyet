import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { config } from "../config";
import { endOfYangonDay, startOfYangonDay } from "../dates";
import type { EventFilters } from "./filters";

export const eventCardInclude = {
  organizer: { select: { id: true, slug: true, name: true, status: true, logoUrl: true } },
  categories: { include: { category: true }, orderBy: { category: { sortOrder: "asc" } } },
  location: true,
  registrationForm: { select: { enabled: true } },
} satisfies Prisma.EventInclude;

export type EventCardRow = Prisma.EventGetPayload<{ include: typeof eventCardInclude }>;

/** Base visibility rule: only published, non-deleted events are public. Unapproved events never match. */
/** An event can be registered for: external link present, or an enabled on-site form. */
export const HAS_REGISTRATION: Prisma.EventWhereInput = {
  OR: [
    { registrationMode: "EXTERNAL", registrationUrl: { not: null } },
    { registrationMode: "ON_PLATFORM", registrationForm: { is: { enabled: true } } },
  ],
};

export const publicWhere: Prisma.EventWhereInput = { publishState: "PUBLISHED", deletedAt: null };

export async function searchIds(q: string): Promise<string[]> {
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Event"
    WHERE "publishState" = 'PUBLISHED' AND "deletedAt" IS NULL AND (
      "searchVector" @@ plainto_tsquery('simple', ${q})
      OR "title" ILIKE ${like} OR "shortDescription" ILIKE ${like}
    ) LIMIT 1000`;
  return rows.map((r) => r.id);
}

export async function buildWhere(f: EventFilters, now = new Date()): Promise<Prisma.EventWhereInput> {
  const and: Prisma.EventWhereInput[] = [publicWhere];

  if (f.q) and.push({ id: { in: await searchIds(f.q) } });
  if (f.category.length) and.push({ categories: { some: { category: { slug: { in: f.category }, isActive: true } } } });
  if (f.location.length) and.push({ location: { slug: { in: f.location } } });
  if (f.format.length) and.push({ format: { in: f.format } });
  if (f.fee === "free") and.push({ feeAmount: 0 });
  if (f.fee === "paid") and.push({ feeAmount: { gt: 0 } });
  if (f.skill?.length) and.push({ skillLevel: { in: f.skill } });
  if (f.organizer) and.push({ organizer: { slug: f.organizer } });
  if (f.eligibility === "students") and.push({ eligibility: { contains: "student", mode: "insensitive" } });
  if (f.eligibility === "university") and.push({ eligibility: { contains: "universit", mode: "insensitive" } });
  if (f.eligibility === "open") and.push({ OR: [{ eligibility: null }, { eligibility: { contains: "open", mode: "insensitive" } }, { eligibility: { contains: "everyone", mode: "insensitive" } }] });

  const openNow: Prisma.EventWhereInput = {
    AND: [
      { cancelled: false, registrationClosedOverride: false, startAt: { gt: now } },
      HAS_REGISTRATION,
      { OR: [{ registrationDeadline: null }, { registrationDeadline: { gt: now } }] },
    ],
  };
  if (f.registration === "open") and.push(openNow);
  if (f.registration === "closed") and.push({ NOT: openNow });

  const from = f.from ? startOfYangonDay(f.from) : null;
  const to = f.to ? endOfYangonDay(f.to) : null;
  if (from) and.push({ OR: [{ endAt: { gte: from } }, { endAt: null, startAt: { gte: from } }] });
  if (to) and.push({ startAt: { lte: to } });

  // By default completed events are hidden; "past" flips the list to completed events.
  // Written with positive conditions only: NOT(<nullable comparison>) would silently drop rows with NULL endAt.
  const cutoff = new Date(now.getTime() - 24 * 3_600_000); // events without endAt are assumed to last one day
  const notEnded: Prisma.EventWhereInput = { OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: cutoff } }] };
  const ended: Prisma.EventWhereInput = { OR: [{ endAt: { lt: now } }, { endAt: null, startAt: { lt: cutoff } }] };
  if (!from && !to) and.push(f.past ? ended : notEnded);
  if (f.sort === "deadline") and.push({ registrationDeadline: { gt: now }, cancelled: false });

  return { AND: and };
}

export function buildOrderBy(sort: EventFilters["sort"]): Prisma.EventOrderByWithRelationInput[] {
  switch (sort) {
    case "deadline": return [{ registrationDeadline: { sort: "asc", nulls: "last" } }, { startAt: "asc" }];
    case "newest": return [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
    case "date": return [{ startAt: "desc" }];
    default: return [{ startAt: "asc" }];
  }
}

export async function listEvents(f: EventFilters, pageSize: number = config.pageSize) {
  const where = await buildWhere(f);
  const [total, items] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      include: eventCardInclude,
      orderBy: buildOrderBy(f.sort),
      skip: (f.page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getFeatured(limit = 6) {
  return db.event.findMany({
    where: { ...publicWhere, featured: true, cancelled: false, OR: [{ endAt: { gte: new Date() } }, { endAt: null, startAt: { gte: new Date() } }] },
    include: eventCardInclude,
    orderBy: { startAt: "asc" },
    take: limit,
  });
}

export async function getClosingSoon(limit = 6) {
  const now = new Date();
  return db.event.findMany({
    where: {
      ...publicWhere, cancelled: false, registrationClosedOverride: false, AND: [HAS_REGISTRATION],
      startAt: { gt: now }, registrationDeadline: { gt: now },
    },
    include: eventCardInclude,
    orderBy: { registrationDeadline: "asc" },
    take: limit,
  });
}

export async function getUpcomingByCategory(categorySlug: string, limit = 6) {
  const now = new Date();
  return db.event.findMany({
    where: {
      ...publicWhere, cancelled: false,
      categories: { some: { category: { slug: categorySlug } } },
      OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }],
    },
    include: eventCardInclude,
    orderBy: { startAt: "asc" },
    take: limit,
  });
}

export async function getOnlineEvents(limit = 6) {
  const now = new Date();
  return db.event.findMany({
    where: {
      ...publicWhere, cancelled: false,
      OR: [{ format: { in: ["ONLINE", "HYBRID"] } }, { location: { type: { in: ["ONLINE", "INTERNATIONAL"] } } }],
      AND: [{ OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }] }],
    },
    include: eventCardInclude,
    orderBy: { startAt: "asc" },
    take: limit,
  });
}

export async function getEventBySlug(slug: string) {
  return db.event.findFirst({
    where: { slug, ...publicWhere },
    include: {
      ...eventCardInclude,
      organizer: true,
    },
  });
}
