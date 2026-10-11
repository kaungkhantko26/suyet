/**
 * Starts a real PostgreSQL server for local development / tests when Docker is unavailable.
 * Usage: npm run db:local   (keeps running; Ctrl+C to stop)
 * Data lives in .local-pg/ (git-ignored). Listens on 127.0.0.1:54329.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import net from "node:net";

const dataDir = process.env.LOCAL_PG_DIR ?? ".local-pg/data";
const port = Number(process.env.LOCAL_PG_PORT ?? 54329);

// If something already listens on the port (e.g. a previous `npm run db:local`), say so instead of crashing.
const inUse = await new Promise<boolean>((resolve) => {
  const sock = net.connect({ host: "127.0.0.1", port }, () => { sock.destroy(); resolve(true); });
  sock.on("error", () => resolve(false));
});
if (inUse) {
  console.log(`PostgreSQL is already running on 127.0.0.1:${port}: nothing to start. Run \`npm run dev\`.`);
  console.log(`To stop it: pkill -f scripts/local-db.ts   (or kill the postgres process listed in ${dataDir}/postmaster.pid)`);
  process.exit(0);
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "letstech",
  password: "letstech",
  port,
  persistent: true,
});

if (!existsSync(`${dataDir}/PG_VERSION`)) await pg.initialise();
await pg.start();
for (const db of ["letstech_events", "letstech_events_test", "letstech_events_e2e"]) {
  try {
    await pg.createDatabase(db);
  } catch {
    /* already exists */
  }
}
console.log(`Postgres ready: postgresql://letstech:letstech@127.0.0.1:${port}/letstech_events`);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
