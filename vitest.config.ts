import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false, // integration tests share one database
    testTimeout: 30_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://letstech:letstech@127.0.0.1:54329/letstech_events_test",
      INTERNAL_API_SECRET: "test-internal-secret",
      APP_URL: "http://localhost:3000",
      SESSION_SECRET: "test-session-secret-0123456789-abcdef-xyz",
      NODE_ENV: "test",
    },
  },
});
