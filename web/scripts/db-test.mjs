// Run the pgTAP tests in supabase/tests/*.sql against the DEV database.
//
//   node scripts/db-test.mjs                 # all test files
//   node scripts/db-test.mjs rls             # only files whose name contains "rls"
//
// `supabase test db` needs Docker even for a remote database, so this runner
// sends each file to Postgres with node-postgres and reads pgTAP's TAP output.
// Each test file must wrap itself in begin; ... rollback; so it leaves no data.
// Reads SUPABASE_DEV_DB_URL only, so it cannot touch the prod project.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ENV_FILE = ".env.test.local";
const TEST_DIR = path.join("supabase", "tests");

if (!existsSync(ENV_FILE)) {
  console.error(`Missing web/${ENV_FILE}. See "One-time setup" in web/README.md.`);
  process.exit(1);
}
process.loadEnvFile(ENV_FILE);
const url = process.env.SUPABASE_DEV_DB_URL;
if (!url) {
  console.error(`SUPABASE_DEV_DB_URL is missing from web/${ENV_FILE}.`);
  process.exit(1);
}

const filter = process.argv[2] ?? "";
const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith(".sql") && f.includes(filter))
  .sort();
if (files.length === 0) {
  console.error(`No test files in ${TEST_DIR} matching "${filter}".`);
  process.exit(1);
}

/** All text rows from a (possibly multi-statement) query result, in order. */
function tapLines(result) {
  const results = Array.isArray(result) ? result : [result];
  return results
    .flatMap((r) => r.rows ?? [])
    .flatMap((row) => Object.values(row))
    .filter((v) => typeof v === "string")
    .flatMap((v) => v.split("\n"));
}

const client = new pg.Client({
  connectionString: url,
  // Supabase requires TLS. This runner only talks to the dev project.
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

let failedFiles = 0;
try {
  await client.connect();
  // Test-only extension; kept out of the migrations so prod never gets it.
  await client.query("create extension if not exists pgtap with schema extensions");

  for (const file of files) {
    const sql = readFileSync(path.join(TEST_DIR, file), "utf8");
    let lines = [];
    let error;
    try {
      lines = tapLines(await client.query(sql));
    } catch (e) {
      error = e;
      await client.query("rollback").catch(() => {});
    }

    const plan = lines.map((l) => /^1\.\.(\d+)/.exec(l)).find(Boolean);
    const ok = lines.filter((l) => /^ok \d+/.test(l)).length;
    const notOk = lines.filter((l) => /^not ok \d+/.test(l));
    const planned = plan ? Number(plan[1]) : undefined;
    const passed = !error && notOk.length === 0 && planned !== undefined && planned === ok;

    console.log(`${passed ? "PASS" : "FAIL"}  ${file}  (${ok}/${planned ?? "?"} ok)`);
    if (!passed) {
      failedFiles++;
      if (error) console.log(`      error: ${error.message}${error.where ? `\n      at: ${error.where}` : ""}`);
      if (planned === undefined && !error) console.log("      no plan found (missing select plan(n) / finish()?)");
      if (planned !== undefined && planned !== ok + notOk.length) console.log(`      planned ${planned} tests but ran ${ok + notOk.length}`);
      // Print each failure with the diagnostic lines that follow it.
      for (let i = 0; i < lines.length; i++) {
        if (/^not ok \d+/.test(lines[i])) {
          console.log(`      ${lines[i]}`);
          for (let j = i + 1; j < lines.length && lines[j].startsWith("#"); j++) console.log(`      ${lines[j]}`);
        }
      }
    }
  }
} catch (e) {
  console.error(`Could not run tests: ${e.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

console.log(failedFiles === 0 ? `\nAll ${files.length} test file(s) passed.` : `\n${failedFiles} of ${files.length} test file(s) failed.`);
process.exit(failedFiles === 0 ? 0 : 1);
