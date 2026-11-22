import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end tests against a production build of the app, using the DEV
 * Supabase project (.env.local) and temporary test users created directly
 * in the dev database (see e2e/support/dev-users.ts).
 *
 * Owezy is mostly used on phones, by a mix of Android and iPhone users, so
 * every test runs twice:
 * - "android": Chromium engine, Pixel 7 screen, touch and mobile mode. Uses
 *   the installed Microsoft Edge, so no browser download is needed
 *   (PW_CHANNEL=chrome to switch).
 * - "iphone": WebKit (Safari's engine), iPhone 15 screen and touch. Needs a
 *   one-time `npx playwright install webkit`.
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
    trace: "retain-on-failure",
  },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL ?? "msedge" } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
