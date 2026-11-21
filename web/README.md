# Owezy web app

Owezy: the multi-user, mobile-first version of the expense splitter (originally a Python CLI). Next.js 16 + Supabase. See [`../ROADMAP.md`](../ROADMAP.md) for the plan and [`../REVIEW.md`](../REVIEW.md) for the per-milestone checklist.

## Commands

Run from this `web/` folder:

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm run test         # Vitest, single run (test:watch to keep it running)
npm run test:e2e     # Playwright: builds, starts on :3100, runs e2e/ in installed Edge against the dev project
npm run build
```

Database (dev project only; reads `SUPABASE_DEV_DB_URL` from `.env.test.local`, no Docker):

```bash
npx supabase migration new <name>   # new file in supabase/migrations/
npm run db:push      # apply new migrations to dev
npm run db:reset     # wipe dev and re-apply every migration (destroys dev data)
npm run db:test      # run pgTAP tests in supabase/tests/ (add a word to filter, e.g. -- rls)
npm run db:types     # regenerate src/lib/supabase/types.ts after a schema change
```

## One-time setup (done by the project owner)

Do step 1 before M3 (database) and step 2 before M4 (sign-in). The app runs without them until then.

### 1. Supabase projects (two: dev and prod)
Development and all automated tests use a separate **dev** project, so tests can never touch real data. Both are free.

1. Sign up at https://supabase.com and click **New project**.
2. Name it `owezy-dev`. Set a strong database password and save it in a password manager. Pick the region **South Asia (Mumbai)**. Click **Create**.
3. Repeat for the real app: name it `owezy`, with its own password, also in Mumbai.
4. In the **dev** project:
   1. Open **Project Settings → Data API** and copy the **Project URL**.
   2. Open **Project Settings → API Keys** and copy the **Publishable key** (starts with `sb_publishable_`). Do **not** use the secret key in this app.
   3. In this folder, copy `.env.example` to `.env.local` and paste both values into it.
   4. Click **Connect** (top bar) → **Session pooler** and copy the connection string. Put your dev database password in place of `[YOUR-PASSWORD]`. Save it in a new file `web/.env.test.local` as `SUPABASE_DEV_DB_URL=<that string>`. This is used from M3 on for migrations and database tests.

The prod project's keys aren't needed until M7, when they go into Vercel.

### 2. Google sign-in
1. Go to https://console.cloud.google.com and create a project (e.g. `Owezy`).
2. Open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name and your email, and save. You can leave it in "Testing" for now; add your friends' Gmail addresses under **Test users**.
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose **Web application**.
4. Under **Authorized redirect URIs**, add `https://<project-ref>.supabase.co/auth/v1/callback` once for **each** Supabase project (dev and prod). The ref is the subdomain in each project's URL.
5. Copy the **Client ID** and **Client secret**.
6. In the **dev** Supabase project, open **Authentication → Sign In / Providers → Google**. Turn it on, paste the Client ID and secret, and save. (The same goes for prod in M7.)
7. In the **dev** project, open **Authentication → URL Configuration**. Set **Site URL** to `http://localhost:3000` and add `http://localhost:3000/**` under **Redirect URLs**. The production URL gets added in M7.

Email-link sign-in is on by default in Supabase. Nothing to set up for it.

### 3. Vercel (dev deployment, before M5)
This puts the app on a real `https://` address so it can be tested on phones. Until M7 it uses the **dev** Supabase project.

1. Go to https://vercel.com and **Sign up with GitHub**.
2. Click **Add New… → Project**. Find `Parthmehta005/Owezy` and click **Import**. If it isn't listed, use **Adjust GitHub App Permissions** to give Vercel access to that repo.
3. On the configure screen:
   - **Root Directory**: click **Edit** and choose `web`. Vercel should then detect **Next.js**.
   - **Environment Variables**: add the same two values as in `web/.env.local` (the **dev** project's):
     `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
     These are safe to put here. Never add the database URL from `.env.test.local`.
4. Click **Deploy** and wait for it to finish. Copy the address it shows, e.g. `https://owezy-abc123.vercel.app`. Under **Settings → Domains** you can usually change it to something shorter like `owezy-dev.vercel.app` if it's free.
5. In Supabase **owezy-dev → Authentication → URL Configuration → Redirect URLs**, add `https://<your-vercel-address>/**`, using the exact address from step 4. Keep the localhost entry. Save.
6. On your phone, open the address and sign in with Google.

Each push to `main` redeploys automatically. The server region (Mumbai, `bom1`) is set in `web/vercel.json`, so there's nothing to change for it.
