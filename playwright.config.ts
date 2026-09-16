import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.WANZILA_E2E_PORT ?? "4173");
if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort > 65535) {
  throw new Error("WANZILA_E2E_PORT must be a valid TCP port");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm --filter @wanzila/web preview --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    port: e2ePort,
    reuseExistingServer: false,
  },
});
