// Apply migrations to the PROD database. Push only: no reset, no tests, no seed.
//
//   npm run db:push:prod              # dry run: lists what would be applied
//   npm run db:push:prod -- --apply   # applies it
//
// Reads SUPABASE_PROD_DB_URL from .env.prod.local (gitignored, used by
// nothing else). Refuses to run if:
// - that URL is the dev project, or
// - any local migration hasn't been applied to dev yet (prod only gets
//   migrations that have already run, and been tested, on dev).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import pg from "pg";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const PROD_ENV = ".env.prod.local";
const DEV_ENV = ".env.test.local";
if (!existsSync(PROD_ENV)) fail(`Missing web/${PROD_ENV}. See step 4 of "One-time setup" in web/README.md.`);
if (!existsSync(DEV_ENV)) fail(`Missing web/${DEV_ENV}; it's needed to check dev is up to date first.`);
process.loadEnvFile(PROD_ENV);
process.loadEnvFile(DEV_ENV);

const prodUrl = process.env.SUPABASE_PROD_DB_URL;
const devUrl = process.env.SUPABASE_DEV_DB_URL;
if (!prodUrl || !/^postgres(ql)?:\/\//.test(prodUrl)) fail(`SUPABASE_PROD_DB_URL in web/${PROD_ENV} is missing or not a postgres:// URL.`);

const ref = (url) => /postgres\.([a-z0-9]+):/.exec(url ?? "")?.[1];
if (!ref(prodUrl)) fail("Couldn't read the project ref from SUPABASE_PROD_DB_URL; use the Session pooler string.");
if (ref(prodUrl) === ref(devUrl)) fail("SUPABASE_PROD_DB_URL is the dev project. Refusing.");

// Every local migration must already be on dev.
const local = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.split("_")[0]);
const dev = new pg.Client({ connectionString: devUrl, ssl: { rejectUnauthorized: false } });
await dev.connect();
const onDev = new Set((await dev.query("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version));
await dev.end();
const notOnDev = local.filter((v) => !onDev.has(v));
if (notOnDev.length) fail(`Not on dev yet: ${notOnDev.join(", ")}. Run npm run db:push and npm run db:test first.`);

const apply = process.argv.includes("--apply");
const args = ["supabase", "db", "push", `--remote=${prodUrl}`, ...(apply ? ["--yes"] : ["--dry-run"])];
// Show the command without the password.
console.error(`> supabase db push --remote=<prod db: ${ref(prodUrl)}> ${apply ? "--yes" : "--dry-run"}`);
const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
if (!apply && result.status === 0) console.error("\nDry run only. To apply: npm run db:push:prod -- --apply");
process.exit(result.status ?? 1);
