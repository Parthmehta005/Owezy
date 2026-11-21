# SplitwiseLite web app

Multi-user, mobile-first version of SplitwiseLite. Next.js 16 + Supabase. See [`../ROADMAP.md`](../ROADMAP.md) for the plan and [`../REVIEW.md`](../REVIEW.md) for the per-milestone checklist.

## Commands

Run from this `web/` folder:

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm run test         # Vitest, single run (test:watch to keep it running)
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
2. Name it `splitwiselite-dev`. Set a strong database password and save it in a password manager. Pick the region **South Asia (Mumbai)**. Click **Create**.
3. Repeat for the real app: name it `splitwiselite`, with its own password, also in Mumbai.
4. In the **dev** project:
   1. Open **Project Settings → Data API** and copy the **Project URL**.
   2. Open **Project Settings → API Keys** and copy the **Publishable key** (starts with `sb_publishable_`). Do **not** use the secret key in this app.
   3. In this folder, copy `.env.example` to `.env.local` and paste both values into it.
   4. Click **Connect** (top bar) → **Session pooler** and copy the connection string. Put your dev database password in place of `[YOUR-PASSWORD]`. Save it in a new file `web/.env.test.local` as `SUPABASE_DEV_DB_URL=<that string>`. This is used from M3 on for migrations and database tests.

The prod project's keys aren't needed until M7, when they go into Vercel.

### 2. Google sign-in
1. Go to https://console.cloud.google.com and create a project (e.g. `SplitwiseLite`).
2. Open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name and your email, and save. You can leave it in "Testing" for now; add your friends' Gmail addresses under **Test users**.
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose **Web application**.
4. Under **Authorized redirect URIs**, add `https://<project-ref>.supabase.co/auth/v1/callback` once for **each** Supabase project (dev and prod). The ref is the subdomain in each project's URL.
5. Copy the **Client ID** and **Client secret**.
6. In the **dev** Supabase project, open **Authentication → Sign In / Providers → Google**. Turn it on, paste the Client ID and secret, and save. (The same goes for prod in M7.)
7. In the **dev** project, open **Authentication → URL Configuration**. Set **Site URL** to `http://localhost:3000` and add `http://localhost:3000/**` under **Redirect URLs**. The production URL gets added in M7.

Email-link sign-in is on by default in Supabase. Nothing to set up for it.
