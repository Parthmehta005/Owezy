// Run a Supabase CLI command against the DEV database only.
//
//   node scripts/supabase-dev.mjs db push
//   node scripts/supabase-dev.mjs test db
//
// Reads SUPABASE_DEV_DB_URL from .env.test.local (gitignored) and appends
// --remote=<url> --yes. It never reads any other database URL, so these
// scripts cannot touch the prod project. No Docker is needed.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const ENV_FILE = ".env.test.local";
if (!existsSync(ENV_FILE)) {
  console.error(`Missing web/${ENV_FILE}. See "One-time setup" in web/README.md.`);
  process.exit(1);
}
process.loadEnvFile(ENV_FILE);

const url = process.env.SUPABASE_DEV_DB_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error(`SUPABASE_DEV_DB_URL in web/${ENV_FILE} is missing or not a postgres:// URL.`);
  process.exit(1);
}

const args = [...process.argv.slice(2), `--remote=${url}`, "--yes"];
// Show the command without the password.
console.error(`> supabase ${process.argv.slice(2).join(" ")} --remote=<dev db> --yes`);

const result = spawnSync("npx", ["supabase", ...args], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
