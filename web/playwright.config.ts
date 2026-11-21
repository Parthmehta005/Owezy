import { defineConfig } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end tests against a production build of the app, using the DEV
 * Supabase project (.env.local) and temporary test users created directly
 * in the dev database (see e2e/support/dev-users.ts). Runs in the installed
 * Microsoft Edge, so no browser download is needed; set PW_CHANNEL=chrome
 * (or "chromium" after `npx playwright install chromium`) to change it.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false, // tests share the dev database
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "msedge",
    viewport: { width: 390, height: 844 }, // phone-sized, mobile-first
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
