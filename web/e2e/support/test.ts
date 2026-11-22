/**
 * The `test` every spec uses: Playwright's, plus what's needed to run the
 * same tests against a deployed preview (E2E_BASE_URL) as against a local
 * build.
 *
 * Vercel puts a login wall in front of preview deployments. With
 * VERCEL_AUTOMATION_BYPASS_SECRET (in .env.test.local, from Vercel's
 * Deployment Protection settings), each browser first gets Vercel's bypass
 * cookie with one request to the deployment itself. The secret is never
 * sent anywhere else (not to Supabase), which a global extra header would do.
 */
import { test as base, expect, type BrowserContext } from "@playwright/test";

try {
  process.loadEnvFile(".env.test.local");
} catch {
  // Optional for local runs; dev-users.ts insists on it where needed.
}

const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

/** Headers that pass Vercel's protection; only ever sent to the deployment under test. */
export function bypassHeaders(): Record<string, string> {
  return BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {};
}

/** Give a browser context Vercel's bypass cookie (no-op locally). */
export async function passVercelProtection(context: BrowserContext, baseURL: string | undefined) {
  if (!BYPASS || !baseURL) return;
  const res = await context.request.get(`${baseURL}/login`, { headers: bypassHeaders(), maxRedirects: 0 });
  if (res.status() >= 400) throw new Error(`e2e: Vercel bypass failed (${res.status()}); check VERCEL_AUTOMATION_BYPASS_SECRET.`);
}

// (`provide` is Playwright's fixture callback, usually called `use`; renamed so
// the React hooks lint rule doesn't mistake it for a hook.)
export const test = base.extend({
  context: async ({ context, baseURL }, provide) => {
    await passVercelProtection(context, baseURL);
    await provide(context);
  },
  request: async ({ playwright, baseURL }, provide) => {
    const request = await playwright.request.newContext({ baseURL, extraHTTPHeaders: bypassHeaders() });
    await provide(request);
    await request.dispose();
  },
});

export { expect };
