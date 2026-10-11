/**
 * Least-privilege PostgreSQL roles.
 *
 *   letstech_migrator  owns the schema; used ONLY by the migrate job (prisma migrate deploy). Never used by the running app.
 *   letstech_app       runtime identity: CONNECT + DML on tables. No DDL, no TRUNCATE, no role/ownership powers, and
 *                      INSERT/SELECT only on the append-only audit tables.
 *   (postgres/superuser) administration + backups only; never given to the application.
 *
 * Usage:
 *   tsx scripts/db-roles.ts roles    # as a superuser:  creates/updates the two login roles (needs DB_ADMIN_URL, APP_DB_PASSWORD, MIGRATOR_DB_PASSWORD)
 *   tsx scripts/db-roles.ts grants   # as the schema owner after migrations: (re)applies table grants (needs DATABASE_URL)
 */
import { PrismaClient } from "@prisma/client";

const q = (s: string) => `'${s.replaceAll("'", "''")}'`; // SQL string literal
const id = (s: string) => `"${s.replaceAll('"', '""')}"`; // SQL identifier

export const AUDIT_TABLES = ["AdminAuditLog", "SecurityEvent"];

export async function createRoles(adminUrl: string, db: string, appPassword: string, migratorPassword: string) {
  if (appPassword.length < 16 || migratorPassword.length < 16) throw new Error("Role passwords must be at least 16 characters");
  const p = new PrismaClient({ datasourceUrl: adminUrl });
  try {
    for (const [role, pw] of [["letstech_migrator", migratorPassword], ["letstech_app", appPassword]] as const) {
      const exists = await p.$queryRawUnsafe<{ n: number }[]>(`SELECT 1 AS n FROM pg_roles WHERE rolname = ${q(role)}`);
      await p.$executeRawUnsafe(`${exists.length ? "ALTER" : "CREATE"} ROLE ${id(role)} LOGIN PASSWORD ${q(pw)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    }
    await p.$executeRawUnsafe(`ALTER DATABASE ${id(db)} OWNER TO letstech_migrator`);
    await p.$executeRawUnsafe(`REVOKE ALL ON DATABASE ${id(db)} FROM PUBLIC`);
    await p.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${id(db)} TO letstech_app, letstech_migrator`);
  } finally {
    await p.$disconnect();
  }
}

export async function applyGrants(ownerUrl: string, owner = "letstech_migrator") {
  const p = new PrismaClient({ datasourceUrl: ownerUrl });
  try {
    const run = (sql: string) => p.$executeRawUnsafe(sql);
    await run(`ALTER SCHEMA public OWNER TO ${id(owner)}`).catch(() => {});
    await run(`REVOKE ALL ON SCHEMA public FROM PUBLIC`);
    await run(`GRANT USAGE ON SCHEMA public TO letstech_app`); // USAGE only: no CREATE
    await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO letstech_app`);
    await run(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO letstech_app`);
    await run(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO letstech_app`);
    // Audit trails: the app may append and read, never rewrite (a trigger enforces the same rule for everyone).
    for (const t of AUDIT_TABLES) await run(`REVOKE UPDATE, DELETE, TRUNCATE ON ${id(t)} FROM letstech_app`);
    // Tables created by FUTURE migrations get the same baseline automatically.
    await run(`ALTER DEFAULT PRIVILEGES FOR ROLE ${id(owner)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO letstech_app`);
    await run(`ALTER DEFAULT PRIVILEGES FOR ROLE ${id(owner)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO letstech_app`);
  } finally {
    await p.$disconnect();
  }
}

if (process.argv[1]?.endsWith("db-roles.ts")) {
  const cmd = process.argv[2];
  const env = (k: string) => process.env[k] ?? (() => { throw new Error(`${k} is required`); })();
  if (cmd === "roles") await createRoles(env("DB_ADMIN_URL"), process.env.POSTGRES_DB ?? "letstech_events", env("APP_DB_PASSWORD"), env("MIGRATOR_DB_PASSWORD"));
  else if (cmd === "grants") await applyGrants(env("DATABASE_URL"));
  else { console.error("usage: tsx scripts/db-roles.ts roles|grants"); process.exit(1); }
  console.log(`db-roles ${cmd}: done`);
}
