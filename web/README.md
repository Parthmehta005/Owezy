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

## One-time setup (done by the project owner)

You need these before sign-in and data work (milestones 3 and 4). The app runs without them until then.

### 1. Supabase project
1. Sign up at https://supabase.com and click **New project**.
2. Name it `splitwiselite`. Set a strong database password and save it in a password manager. Pick the region **South Asia (Mumbai)**. Click **Create**.
3. Open **Project Settings → Data API** and copy the **Project URL**.
4. Open **Project Settings → API Keys** and copy the **Publishable key** (starts with `sb_publishable_`). Do **not** use the secret key in this app.
5. In this folder, copy `.env.example` to `.env.local` and paste both values into it.

### 2. Google sign-in
1. Go to https://console.cloud.google.com and create a project (e.g. `SplitwiseLite`).
2. Open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name and your email, and save. You can leave it in "Testing" for now; add your friends' Gmail addresses under **Test users**.
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose **Web application**.
4. Under **Authorized redirect URIs**, add `https://<your-project-ref>.supabase.co/auth/v1/callback`. The ref is the subdomain in your Project URL.
5. Copy the **Client ID** and **Client secret**.
6. In Supabase, open **Authentication → Sign In / Providers → Google**. Turn it on, paste the Client ID and secret, and save.
7. In Supabase, open **Authentication → URL Configuration**. Set **Site URL** to `http://localhost:3000` and add `http://localhost:3000/**` under **Redirect URLs**. The production URL gets added in M7.

Email-link sign-in is on by default in Supabase. Nothing to set up for it.
