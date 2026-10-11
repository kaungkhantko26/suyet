import { execSync } from "node:child_process";

/** Applies all migrations to the dedicated test database before any test runs. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://letstech:letstech@127.0.0.1:54329/letstech_events_test";
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
