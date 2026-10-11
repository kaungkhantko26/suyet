import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

/**
 * Fresh data per run on a dedicated e2e database: apply migrations (non-destructive `migrate deploy`),
 * truncate every table except the migration history, then seed reference + fictional demo data.
 */
export default async function globalSetup() {
  const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://letstech:letstech@127.0.0.1:54329/letstech_events_e2e";
  if (!/e2e|test/i.test(new URL(DATABASE_URL).pathname)) throw new Error("Refusing to wipe a database whose name does not contain 'e2e' or 'test'");
  const env = { ...process.env, DATABASE_URL, NODE_ENV: "development", SESSION_SECRET: "e2e-session-secret-0123456789-abcdefghij" } as NodeJS.ProcessEnv;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  const db = new PrismaClient({ datasourceUrl: DATABASE_URL });
  const rows = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.$disconnect();
  execSync("npx tsx prisma/seed.ts", { stdio: "pipe", env });
  rmSync(".next/cache/fetch-cache", { recursive: true, force: true }); // category/location lookups are cached by id
}
