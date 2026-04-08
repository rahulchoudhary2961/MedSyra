import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

for (const envFile of [".env.playwright.local", ".env.playwright", ".env.local"]) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const port = Number(process.env.PLAYWRIGHT_PORT || 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;
const authFile = "tests/e2e/.auth/user.json";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/auth.setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000
      },
  projects: [
    {
      name: "chromium",
      testIgnore: [
        /auth\.setup\.ts/,
        /auth\.spec\.ts/,
        /clinic-workflows\.spec\.ts/,
        /operations-workflows\.spec\.ts/,
        /dashboard-pages\.spec\.ts/
      ],
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "chromium-auth",
      testMatch: [/auth\.spec\.ts/, /clinic-workflows\.spec\.ts/, /operations-workflows\.spec\.ts/, /dashboard-pages\.spec\.ts/],
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile
      }
    }
  ]
});
