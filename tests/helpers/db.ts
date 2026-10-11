import { db } from "@/lib/db";
import { hashPassword, randomToken } from "@/lib/password";
import { seedReference } from "../../prisma/seed";

export { db };

/** Wipes all data except reference tables (categories/locations), which are (re)seeded. */
export async function resetDb() {
  const rows = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'EventCategory', 'Location')`;
  if (rows.length) await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await seedReference();
}

let n = 0;
export async function makeUser(role: import("@prisma/client").Role = "STUDENT", over: { email?: string; verified?: boolean } = {}) {
  n++;
  return db.user.create({
    data: {
      email: over.email ?? `user${n}-${Date.now()}@test.example`, name: `${role} ${n}`, role, passwordHash: await hashPassword("password-1234"),
      emailVerified: over.verified === false ? null : new Date(),
      notificationPreference: { create: { unsubscribeToken: randomToken(24) } },
    },
  });
}

export async function makeOrganizer(ownerId?: string, name = `Org ${++n}`) {
  return db.organizer.create({
    data: { name, slug: `org-${n}-${Math.random().toString(36).slice(2, 7)}`, type: "UNIVERSITY_CLUB", ...(ownerId ? { members: { create: { userId: ownerId } } } : {}) },
  });
}

export async function categoryIds(...slugs: string[]) {
  return (await db.eventCategory.findMany({ where: { slug: { in: slugs } } })).map((c) => c.id);
}

export const future = (days: number) => new Date(Date.now() + days * 86_400_000);
