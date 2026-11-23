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
npm run test:e2e     # Playwright: builds, starts on :3100, runs e2e/ as an Android phone (installed Edge) and an iPhone (WebKit) against the dev project
                     # first time only: npx playwright install webkit
npm run build
```

Database (dev project only; reads `SUPABASE_DEV_DB_URL` from `.env.test.local`, no Docker):

```bash
npx supabase migration new <name>   # new file in supabase/migrations/
npm run db:push      # apply new migrations to dev
npm run db:push:prod # prod: dry run; add `-- --apply` to apply (needs .env.prod.local; refuses anything not already on dev)
npm run db:reset     # wipe dev and re-apply every migration (destroys dev data)
npm run db:test      # run pgTAP tests in supabase/tests/ (add a word to filter, e.g. -- rls)
npm run db:types     # regenerate src/lib/supabase/types.ts after a schema change
```

## One-time setup (done by the project owner)

Do step 1 before M3 (database), step 2 before M4 (sign-in), step 3 before M5 and step 4 in M7. The app runs without them until then.

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

### 4. Production (M7)
This moves the live address (`https://owezy-chi.vercel.app`) onto the **prod** project, `owezy`. Every other deployment (previews of branches) stays on **dev**. The prod database starts **empty**: groups made while testing on dev don't move over.

#### Part A: prod's database (done before the switch)
1. In Supabase, open the **owezy** (prod) project. Check that **Project Settings → General** shows the region **South Asia (Mumbai)**.
2. Click **Connect** → **Session pooler**, copy the connection string, and put the prod database password in place of `[YOUR-PASSWORD]`. Save it in a new file `web/.env.prod.local` as `SUPABASE_PROD_DB_URL=<that string>`. This file is gitignored and only `npm run db:push:prod` reads it. Never put it in Vercel.
3. Tell Claude. Claude then runs `npm run db:push:prod`, which shows what it would apply, and then applies the migrations to prod.

Do Parts B, C and D in order. Each step says where to click and what you should see. Keep two browser tabs open: **Supabase** (https://supabase.com/dashboard) and **Google Cloud** (https://console.cloud.google.com).

#### Part B: sign-in on prod (about 10 minutes)

**B1. Find prod's sign-in callback address (Supabase)**
1. In the Supabase dashboard, open the **owezy** project (not owezy-dev). Its name shows at the top left.
2. In the left sidebar, click **Authentication** (the people icon).
3. In Authentication's own menu, under **Configuration**, click **Sign In / Providers**.
4. Scroll to the provider list and click **Google**. A panel opens on the right.
5. Near the bottom of that panel is **Callback URL (for OAuth)**, which looks like `https://abcdefgh.supabase.co/auth/v1/callback`. Click its **Copy** button. Leave this panel open; you'll come back in B3.

**B2. Tell Google about that address (Google Cloud)**
1. In Google Cloud, check the project picker at the top left shows your Owezy project. If not, click it and choose it.
2. Click the menu (☰) at the top left → **APIs & Services** → **Credentials**. (Newer consoles call this page **Google Auth Platform → Clients**; either works.)
3. Under **OAuth 2.0 Client IDs** (or **Clients**), click the client you made in step 2, e.g. "Web client 1".
4. Scroll to **Authorized redirect URIs**. One line already holds the dev address (`https://<dev-ref>.supabase.co/auth/v1/callback`).
5. Click **+ Add URI** and paste the prod address you copied in B1.
6. Click **Save** at the bottom. "OAuth client saved" appears. It can take a few minutes to take effect.
7. Stay on this page, because B3 needs the **Client ID** and **Client secret**:
   - **Client ID** is shown at the top right (ends in `.apps.googleusercontent.com`). Copy it.
   - **Client secret**: if you can't see or copy it (Google now hides old secrets), click **+ Add secret**, then copy the new secret it shows. The old secret keeps working for dev, so nothing breaks.

**B3. Turn on Google sign-in in prod (Supabase)**
1. Back in the Supabase tab, in the **Google** panel of the **owezy** project:
2. Switch on **Enable Sign in with Google**.
3. Paste the Client ID into **Client IDs**, and the secret into **Client Secret (for OAuth)**.
4. Click **Save**. Google now shows as **Enabled** in the provider list.

**B4. Tell prod which website it belongs to (Supabase)**
1. Still in **owezy → Authentication**, under **Configuration**, click **URL Configuration**.
2. In **Site URL**, delete what's there (probably `http://localhost:3000`) and type `https://owezy-chi.vercel.app`. Click **Save changes**.
3. Under **Redirect URLs**, click **Add URL**, type `https://owezy-chi.vercel.app/**` (with the two stars), and click **Save URLs**. It now appears in the list.

**B5. Let your friends sign in (Google Cloud)**
While the Google app's publishing status is **Testing**, only the Gmail addresses you list can use Google sign-in. That's the simplest setup for a group of friends:
1. Click ☰ → **Google Auth Platform** → **Audience**. (Older consoles: **APIs & Services → OAuth consent screen**.)
2. Leave **Publishing status** as **Testing**. Don't click Publish.
3. Under **Test users**, click **+ Add users**, enter each friend's Gmail (one per line), and **Save**. Up to 100 people. Add new friends here before they try Google sign-in. Email-link sign-in works for anyone without this.

Publishing (so anyone can use Google sign-in) needs a home page, a privacy policy page and an authorized domain on the **Branding** page. Owezy has no privacy page yet, and Google may not accept a `vercel.app` address as your domain. Leave publishing until Owezy has a privacy page, and ideally its own domain.

#### Part C: point the live site at prod (Vercel, about 5 minutes)
Do this only after Part B. The prod database is already set up (Part A).

**C1. Collect the four values**
Each variable name gets two values: one for prod, one for dev.
- **Prod values (Supabase, `owezy` project):** click the gear icon (**Project Settings**) at the bottom of the left sidebar.
  - **Data API** → copy the **Project URL** (`https://<prod-ref>.supabase.co`).
  - **API Keys** → copy the **Publishable key** (starts with `sb_publishable_`). Do **not** use the secret key.
- **Dev values:** open `web/.env.local` on your computer (VS Code or Notepad). It holds the dev `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Copy each value after the `=`.

Paste all four into a notepad for a few minutes, labelled so you don't mix them up.

**C2. Add the four variables (Vercel)**
1. Go to https://vercel.com, open the **owezy** project, and click **Settings** (top tabs) → **Environment Variables** (left).
2. If any old `NEXT_PUBLIC_SUPABASE_…` rows are still there, delete them (**⋯ → Delete**), so you start clean.
3. Add each row below with the **Add New** / **Add Environment Variable** form. For each one, fill in **Key** and **Value**, choose the **Type**, tick exactly the listed **Environments**, and click **Save**.

| # | Key | Value | Type | Environments |
|---|---|---|---|---|
| 1 | `NEXT_PUBLIC_SUPABASE_URL` | prod Project URL | **Config** | **Production** only |
| 2 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | prod publishable key | **Config** | **Production** only |
| 3 | `NEXT_PUBLIC_SUPABASE_URL` | dev URL (from `.env.local`) | **Config** | **Preview** and **Development** |
| 4 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | dev key (from `.env.local`) | **Config** | **Preview** and **Development** |

4. Check the list. You should have four rows: two for **Production** and two for **Preview, Development**. Watch for typos in the key names, which must match exactly.

About **Type**:
- Choose **Config**, not **Secret**/**Sensitive**. Both values are public by design: every visitor's phone uses them to reach Supabase, and your data is protected by Supabase's row-level security, not by hiding these. Vercel may warn "Remove the public framework prefix to keep this value private"; choose **Config** and keep the names exactly as they are. Removing `NEXT_PUBLIC_` would break sign-in.
- Nothing in Owezy goes into Vercel as a **Secret**. The Supabase secret key and the database URLs (`.env.test.local`, `.env.prod.local`) must never be added to Vercel at all.

**C3. Rebuild the live site with the new values (Vercel)**
1. Click the **Deployments** tab at the top.
2. The top row with a **Production** label (and **Current**) is the live one. Click the **⋯** at the end of that row → **Redeploy** → **Redeploy** again to confirm.
3. Wait until it shows **Ready** (about 1–2 minutes).
4. On your phone, open https://owezy-chi.vercel.app and sign in with Google. You should land on **New group**, because prod is empty. Your test groups stay on dev.

Then tell Claude, who checks that the site really uses prod (without creating anything there).

#### Part D: let Claude test preview links (Vercel, optional, about 5 minutes)
Previews are the copies Vercel builds for branches other than `main`. They use dev, and Vercel puts a login wall in front of them.

**D1. Create a pass for the browser tests (Vercel)**
1. In the **owezy** project → **Settings** → **Deployment Protection** (left).
2. Leave **Vercel Authentication** on (**Standard Protection**), so strangers can't open previews.
3. Scroll to **Protection Bypass for Automation** and click **Add Secret** (or **Create**). Leave the note empty or type "playwright", and confirm.
4. Copy the secret it shows.

**D2. Save it on your computer**
1. Open the file `web/.env.test.local` in VS Code or Notepad. It already has a `SUPABASE_DEV_DB_URL=...` line.
2. Add a new line: `VERCEL_AUTOMATION_BYPASS_SECRET=<paste the secret>`. Save. (The file is gitignored, so it never goes to GitHub.)

**D3. Allow sign-in on preview addresses (Supabase, owezy-dev)**
1. In Vercel, open **Deployments** and click any deployment. Under **Domains** you'll see an address like `owezy-git-main-parths-projects-1a2b3c.vercel.app`. The part after `owezy-git-main-` is your team part, here `parths-projects-1a2b3c`.
2. In Supabase, open **owezy-dev** (the dev one) → **Authentication** → **URL Configuration**.
3. Under **Redirect URLs**, click **Add URL**, type `https://owezy-*-<team part>.vercel.app/**` (e.g. `https://owezy-*-parths-projects-1a2b3c.vercel.app/**`), and **Save URLs**.

Then tell Claude. Claude can push a test branch, wait for its preview, and run all the browser tests against it:

```bash
E2E_BASE_URL=https://<preview-address> npm run test:e2e            # bash
$env:E2E_BASE_URL="https://<preview-address>"; npm run test:e2e    # PowerShell
```

Note: Supabase's built-in email sends only a few sign-in links per hour. Google sign-in has no such limit.
