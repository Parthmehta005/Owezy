/**
 * Temporary test users on the DEV Supabase project.
 *
 * Users are inserted straight into the dev database with a password (no
 * email is sent), signed in through @supabase/ssr exactly as the app does,
 * and their session cookies are handed to the browser. Everything they
 * create is removed by cleanupDevUsers(). Refuses to run unless the app
 * under test (.env.local) and the database (.env.test.local) are the same
 * project, so tests can never touch prod.
 */
import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";
import pg from "pg";

process.loadEnvFile(".env.local");
process.loadEnvFile(".env.test.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const DB_URL = process.env.SUPABASE_DEV_DB_URL!;
const EMAIL_PREFIX = "e2e-";
const EMAIL_DOMAIN = "@example.com";

function assertSameDevProject() {
  const appRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const dbRef = /postgres\.([a-z0-9]+):/.exec(DB_URL)?.[1];
  if (!appRef || appRef !== dbRef) {
    throw new Error("e2e: .env.local and .env.test.local point at different Supabase projects; refusing to run.");
  }
}
assertSameDevProject();

let client: pg.Client | undefined;
async function db() {
  if (!client) {
    client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
  }
  return client;
}

export interface DevUser {
  id: string;
  email: string;
  cookies: { name: string; value: string }[];
}

/** Create a confirmed password user (tag must be unique per test run) and sign them in. */
export async function createDevUser(tag: string, fullName: string): Promise<DevUser> {
  const email = `${EMAIL_PREFIX}${tag}${EMAIL_DOMAIN}`;
  const password = `pw-${crypto.randomUUID()}`;
  const conn = await db();
  await conn.query("delete from auth.users where email = $1", [email]);
  const { rows } = await conn.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1,
       extensions.crypt($2, extensions.gen_salt('bf')), now(), '', '', '', '',
       '{"provider":"email","providers":["email"]}', $3, now(), now())
     returning id`,
    [email, password, JSON.stringify({ full_name: fullName })],
  );

  const jar = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: rows[0].id, email, cookies: [...jar].map(([name, value]) => ({ name, value })) };
}

/** Put a user's session cookies into a browser context. */
export async function signIn(context: BrowserContext, user: DevUser, baseURL: string) {
  await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL })));
}

/** Delete every e2e user and every group they were part of (children first). */
export async function cleanupDevUsers() {
  const conn = await db();
  const users = (await conn.query<{ id: string }>("select id from auth.users where email like $1", [`${EMAIL_PREFIX}%${EMAIL_DOMAIN}`])).rows.map((r) => r.id);
  if (users.length) {
    const groups = (
      await conn.query<{ id: string }>(
        `select distinct group_id as id from public.members where user_id = any($1)
         union select id from public.groups where created_by = any($1)`,
        [users],
      )
    ).rows.map((r) => r.id);
    await conn.query("delete from public.expense_shares where group_id = any($1)", [groups]);
    await conn.query("delete from public.expenses where group_id = any($1)", [groups]);
    await conn.query("update public.profiles set last_group_id = null where last_group_id = any($1)", [groups]);
    await conn.query("delete from public.members where group_id = any($1)", [groups]);
    await conn.query("delete from public.groups where id = any($1)", [groups]);
    await conn.query("delete from auth.users where id = any($1)", [users]);
  }
}

export async function closeDb() {
  await client?.end();
  client = undefined;
}
