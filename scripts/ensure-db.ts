/**
 * `npm run dev` runs this first (npm "predev" hook): if DATABASE_URL points at the embedded local Postgres (127.0.0.1:54329)
 * and nothing is listening, start it in the background and wait until it accepts connections. If you use your own
 * PostgreSQL (any other host/port), this does nothing.
 */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import net from "node:net";

try { process.loadEnvFile(".env"); } catch { /* optional */ }
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const isEmbedded = !!url && ["127.0.0.1", "localhost"].includes(url.hostname) && Number(url.port) === port;
if (!isEmbedded) process.exit(0);

const up = () => new Promise<boolean>((resolve) => {
  const s = net.connect({ host: "127.0.0.1", port }, () => { s.destroy(); resolve(true); });
  s.on("error", () => resolve(false));
});

if (await up()) process.exit(0);

console.log("Starting local PostgreSQL in the background…");
mkdirSync(".local-pg", { recursive: true });
const out = openSync(".local-pg/postgres.log", "a");
const child = spawn("npx", ["tsx", "scripts/local-db.ts"], { detached: true, stdio: ["ignore", out, out], env: process.env });
child.unref();
closeSync(out);

for (let i = 0; i < 60; i++) {
  if (await up()) { console.log(`PostgreSQL ready on 127.0.0.1:${port} (log: .local-pg/postgres.log, stop with: npm run db:stop)`); process.exit(0); }
  await new Promise((r) => setTimeout(r, 1000));
}
console.error("PostgreSQL did not start within 60s. See .local-pg/postgres.log");
process.exit(1);
