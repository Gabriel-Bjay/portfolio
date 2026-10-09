import { defineConfig, devices } from "@playwright/test";

// PW_CHROMIUM_PATH: use a preinstalled Chromium (e.g. /opt/pw-browsers/chromium in sandboxes).
// E2E_BASE_URL: test an already-running server (e.g. a dev server) instead of `next start`.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const externalUrl = process.env.E2E_BASE_URL;
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: externalUrl ?? `http://localhost:${PORT}`,
    launchOptions: { executablePath },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: externalUrl
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
