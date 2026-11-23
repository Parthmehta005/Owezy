/**
 * Runs once before e2e tests against a deployed URL (E2E_BASE_URL). The
 * tests create users straight in the DEV database, so the deployment must
 * be wired to that same dev project, never to prod. Its Supabase URL is
 * built into its JavaScript, so read it from there and refuse to run on a
 * mismatch.
 */
import { bypassHeaders } from "./test";

export default async function remoteGuard() {
  process.loadEnvFile(".env.local");
  const base = process.env.E2E_BASE_URL!.replace(/\/$/, "");
  const devRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];

  const page = await fetch(`${base}/login`, { headers: bypassHeaders({ setCookie: false }) });
  if (!page.ok) {
    throw new Error(`e2e: ${base}/login answered ${page.status}. A protected preview needs VERCEL_AUTOMATION_BYPASS_SECRET in .env.test.local.`);
  }
  const scripts = [...(await page.text()).matchAll(/<script src="([^"]+)"/g)].map((m) => new URL(m[1], base).href);
  const refs = new Set<string>();
  for (const src of scripts) {
    const js = await (await fetch(src, { headers: bypassHeaders({ setCookie: false }) })).text();
    for (const m of js.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)) refs.add(m[1]);
  }
  if (refs.size !== 1 || !refs.has(devRef)) {
    throw new Error(
      `e2e: ${base} uses Supabase project(s) [${[...refs].join(", ") || "none found"}], not the dev project; refusing to run.`,
    );
  }
}
