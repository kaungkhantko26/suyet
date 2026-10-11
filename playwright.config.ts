import { defineConfig, devices } from "@playwright/test";

const DB = process.env.E2E_DATABASE_URL ?? "postgresql://letstech:letstech@127.0.0.1:54329/letstech_events_e2e";
const PORT = 3100;
// ≥ 32 chars: the app (production mode) derives the MFA encryption key from it; the seed must use the same value.
export const E2E_SECRET = "e2e-session-secret-0123456789-abcdefghij";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL: DB, APP_URL: `http://localhost:${PORT}`, SESSION_SECRET: E2E_SECRET, INTERNAL_API_SECRET: "e2e", INTERNAL_AUTH_MODE: "both", CSP_MODE: "enforce", NODE_ENV: "production" },
  },
});
