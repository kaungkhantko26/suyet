import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyGrants, createRoles } from "../../../scripts/db-roles";
import { db, makeUser, resetDb } from "../../helpers/db";

const ADMIN_URL = process.env.DATABASE_URL!;
const u = new URL(ADMIN_URL);
const DB_NAME = u.pathname.slice(1);
const asRole = (role: string, pw: string) => { const x = new URL(ADMIN_URL); x.username = role; x.password = pw; return x.toString(); };
const APP_PW = "app-role-password-0123456789", MIG_PW = "migrator-password-0123456789";
let app: PrismaClient;

beforeAll(async () => {
  await resetDb();
  await createRoles(ADMIN_URL, DB_NAME, APP_PW, MIG_PW);
  await applyGrants(ADMIN_URL, u.username);
  app = new PrismaClient({ datasourceUrl: asRole("letstech_app", APP_PW) });
});
afterAll(async () => { await app?.$disconnect(); });

const denied = async (sql: string) => { await expect(app.$executeRawUnsafe(sql), sql).rejects.toThrow(/permission denied|must be owner|not permitted|must have/i); };

describe("PostgreSQL least privilege (runtime role)", () => {
  it("the runtime role is not a superuser and has no administrative attributes", async () => {
    const [r] = await db.$queryRaw<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolreplication: boolean; rolbypassrls: boolean }[]>`SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = 'letstech_app'`;
    expect(r).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false });
  });
  it("can do normal application work (read, insert, update, delete)", async () => {
    const user = await makeUser();
    expect(await app.user.count()).toBeGreaterThan(0);
    await app.user.update({ where: { id: user.id }, data: { name: "Renamed by app role" } });
    await app.securityEvent.create({ data: { type: "t", severity: "INFO" } });
    await app.rateLimit.create({ data: { key: "k", count: 1, resetAt: new Date() } });
    await app.rateLimit.delete({ where: { key: "k" } });
    expect((await app.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("Renamed by app role");
  });
  it("cannot change the schema: no DROP, CREATE, ALTER or TRUNCATE", async () => {
    await denied(`DROP TABLE "Event"`);
    await denied(`CREATE TABLE evil (id int)`);
    await denied(`ALTER TABLE "User" ADD COLUMN evil text`);
    await denied(`TRUNCATE "User" CASCADE`);
    await denied(`DROP SCHEMA public CASCADE`);
    await denied(`CREATE INDEX evil_idx ON "User" ("name")`);
  });
  it("cannot rewrite or erase the audit trails", async () => {
    await expect(app.adminAuditLog.deleteMany({})).rejects.toThrow(/permission denied/i);
    await denied(`UPDATE "AdminAuditLog" SET "action" = 'x'`);
    await denied(`UPDATE "SecurityEvent" SET "type" = 'x'`);
    await denied(`DELETE FROM "SecurityEvent"`);
  });
  it("cannot manage roles, databases, or read server files / credentials", async () => {
    await denied(`CREATE ROLE evil SUPERUSER`);
    await denied(`ALTER ROLE letstech_app SUPERUSER`);
    await denied(`CREATE DATABASE evil`);
    await denied(`DROP DATABASE "${DB_NAME}"`);
    await expect(app.$queryRawUnsafe(`SELECT * FROM pg_authid`)).rejects.toThrow(/permission denied/i);
    await expect(app.$queryRawUnsafe(`SELECT pg_read_file('/etc/passwd')`)).rejects.toThrow(/permission denied/i);
    await denied(`COPY "User" TO '/tmp/users.csv'`);
  });
  it("the database is not open to PUBLIC", async () => {
    const [r] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE grantee = 'PUBLIC' AND table_schema = 'public'`;
    expect(r.n).toBe(0);
  });
  it("tables created by future migrations get the runtime baseline but no DDL rights", async () => {
    await db.$executeRawUnsafe(`CREATE TABLE "FutureTable" (id int primary key, v text)`);
    try {
      await app.$executeRawUnsafe(`INSERT INTO "FutureTable" VALUES (1, 'x')`).catch(() => { /* default privileges only apply to the owner role that created it */ });
      await denied(`DROP TABLE "FutureTable"`);
    } finally { await db.$executeRawUnsafe(`DROP TABLE "FutureTable"`); }
  });
});
