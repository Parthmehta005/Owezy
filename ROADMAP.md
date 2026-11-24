# Roadmap: Owezy web app

Source of truth for the build: v1 (M1–M7, done) and the v2 plan (M8 onward). Tick a milestone only after it passes its checklist in [REVIEW.md](REVIEW.md).

## Context
Owezy started as a single-user, in-memory Python CLI (`main.py`, `ui.py`, `logic.py`, `visualize.py`). The goal is for it to be a proper app that several people use at the same time, with a simple, elegant UI that needs as few taps as possible, and a path to mobile later.

v1 covers only the basics and puts multi-user groups first. Live updates, settle-up payments, categories, receipts, activity feed and notifications come later, one by one.

Decisions so far:
- Installable mobile-first web app (PWA)
- Sign-in with Google or an email link
- People can be added by name and invited later
- One-screen, amount-first add-expense
- Opens straight into the last-used group
- Any group member can edit or delete expenses
- Clean, minimal look with light and dark mode
- Free hosting tiers
- Balances shown raw by default, with a "Simplify" toggle
- Stack optimised for speed

## Tech stack
| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16 (App Router) + React 19 + TypeScript** | One codebase for UI and server. Deploys on Vercel in one click. |
| Styling/UI | **Tailwind CSS + shadcn/ui** (Radix primitives, `vaul` bottom sheets), `lucide-react` icons, `next-themes` for dark mode | Minimal and accessible, with native-feeling bottom sheets on phones. |
| Data/state | **TanStack Query** | Caches data so screens open instantly. Expenses appear the moment you save (optimistic updates). Refetches when you return to the app, so you see friends' changes without live updates. |
| Backend | **Supabase**: Postgres, Auth (Google + magic link), Row Level Security, SQL functions | No custom server to write. RLS keeps each group private. Realtime is built in for when live updates are added. |
| Validation | **Zod** | Shared form and server validation. |
| Tests | **Vitest** for logic, **Playwright** for two-user end-to-end tests | |
| Hosting | **Vercel** (region `bom1`) + **Supabase** (region `ap-south-1`, Mumbai): a `-dev` project for development and tests, plus a prod project | Both free. Keeping them in the same region keeps the app fast. |
| Mobile later | Pure logic kept in its own folder (`web/src/core/`), with no React or Supabase code | Can be wrapped with Capacitor, or shared with a future Expo app. |

**Why TypeScript rather than a Python backend:** one language, no separate API server, and less latency. `logic.py` is small and pure, so porting it (with its tests) is cheap.

## Screens and UX (mobile-first, 1 column; on desktop it is a centred 480px column)
1. **Sign in**: app name, a "Continue with Google" button, and an email field with "Send me a link".
2. **Group screen** (the home screen; opens the last-used group, stored on the user's profile so it works across devices):
   - Header: group name ▾ (opens a switcher sheet listing groups and "+ New group"), with a settings icon.
   - Big summary: "You get back ₹675" in green, "You owe ₹150" in red, or "All settled".
   - Segmented control: **Expenses | Balances**.
   - Expenses: grouped by date. Each row shows the description, "Rahul paid ₹900", and your share effect on the right. Tap a row to edit it.
   - Balances: the raw pairwise debts ("Aditi owes Rahul ₹150"). A **Simplify** toggle switches to the greedy settlement and shows "3 → 2 payments".
   - A floating **+** button opens Add expense.
3. **Add/Edit expense** (bottom sheet, everything on one screen):
   - The amount is focused first (`inputmode="decimal"`, so phones show the number pad), then the description.
   - The **Paid by** chip defaults to you; tapping it opens a member picker.
   - The **Split** chip defaults to "Equally, all N". Tapping it opens checkboxes per member and an **Unequally** toggle. With unequal on, each person gets an amount field, and a live "₹X left" counter turns the Save button on only when the shares add up exactly.
   - A live preview line shows "you get back ₹675".
   - Delete (edit mode only) shows an **Undo** toast instead of a confirm dialog.
4. **Create group**: a name field, and member names typed as chips (space or Enter adds one). You are added automatically.
5. **Group settings**:
   - Rename the group.
   - Member list. Add a person by name. A person can be removed only if no expense uses them.
   - **Invite link**, using the phone's Share button (WhatsApp etc.) or Copy.
   - Leave group.
6. **Join** (`/join/<code>`): sign in if needed, then "Which one are you?", picking from unclaimed names or choosing "I'm new". You land in the group.

Number format: Indian grouping via `Intl.NumberFormat('en-IN')` (`₹12,00,000.00`). This replaces the CLI's `₹1,200,000.00`.

## Data model (Supabase migrations in `web/supabase/migrations/`)
- `profiles(id → auth.users, display_name, last_group_id)`
- `groups(id, name, invite_code unique, created_by, created_at)`
- `members(id, group_id, display_name, user_id null, created_at)`
  - `user_id` is null for a placeholder (added by name, not signed up yet).
  - Unique on `(group_id, lower(display_name))`, matching today's case-insensitive duplicate rule.
  - Unique on `(group_id, user_id)`.
  - Member order is `created_at`, which is used for the equal-split leftover paise (same rule as today).
- `expenses(id, group_id, description, payer_member_id, total_paise bigint, split_type, created_by, created_at, updated_at, deleted_at null, version, expense_date)` (`expense_date` added in M5). Deleting sets `deleted_at` (a soft delete), which makes Undo possible. `version` goes up on every change.
- `expense_shares(expense_id, member_id, share_paise bigint)`
- **RLS:** you can read and write a group's rows only if you are a member of that group with `user_id = auth.uid()`.
- **SQL functions (RPC)**, each one an atomic transaction:
  - `create_expense`: rejects the save if the shares don't sum exactly to the total, or if a member belongs to a different group.
  - `update_expense(..., expected_version)`: if someone else edited the expense in the meantime, it fails with "This was changed by someone else" (HTTP 409), and the app reloads it. This handles two people editing at once. An integer version is used instead of `updated_at` because JavaScript dates drop Postgres's microseconds.
  - `join_group(code, claim_member_id | new_name)`
  - `create_group(name, member_names[])`
- All money is integer paise end to end. JS numbers are exact up to about 9×10¹⁵ paise, far beyond any real amount.

## Code layout (new `web/` folder; the Python CLI stays as it is)
- `web/src/core/money.ts`: ports of `parse_amount` and `format_inr` (`logic.py`)
- `web/src/core/names.ts`: ports of `validate_names` and `add_names`
- `web/src/core/splits.ts`: ports of `split_equal` and `validate_unequal`
- `web/src/core/balances.ts` and `simplify.ts`: ports of `compute_balances`, `pairwise_debts` and `simplify_debts`. Balances are computed on the phone from cached data, so there is no extra server call.
- `web/src/core/*.test.ts`: Vitest ports of every applicable case in `test_logic.py`
- `web/src/lib/supabase/`: browser and server clients (`@supabase/ssr`)
- `web/src/app/`: routes (`/login`, `/g/[groupId]`, `/g/[groupId]/settings`, `/new`, `/join/[code]`, `/`, where `/` redirects to the last group)
- `web/src/components/`: `ExpenseSheet`, `SplitPicker`, `BalancesView`, `GroupSwitcher`, etc.
- PWA: `app/manifest.ts` and icons, so the app can be added to the home screen. No offline mode in v1.

## Speed measures
- One query loads the group, its members, and its expenses with their shares. TanStack Query caches the result, and balances are computed on the phone.
- Optimistic add, edit and delete, with rollback if the server rejects the change.
- Data refreshes when you come back to the app or tab (M5), and on pull-to-refresh (M7).
- Vercel and Supabase sit in the same Mumbai region.
- Heavy code (the sheets) loads only when needed.

## How milestones are worked

- Each milestone has a **Goal** (what is demonstrably true when it is done), a **Scope** (what is in and out), and **Tasks**.
- Work only inside the current milestone's scope. Anything else goes in a later milestone; it is not added on the side.
- Each task is one commit, or a few if it is large. Every commit makes sense on its own, passes `lint`, `typecheck` and `test`, starts with the milestone tag (e.g. `M2: ...`), and ticks its task here in the same commit. This keeps `git bisect` and review simple.
- A milestone is ticked only when its Goal is shown to work and its section in [REVIEW.md](REVIEW.md) passes. Then stop and wait for the owner's go-ahead.
- Environments: two Supabase projects. **`owezy-dev`** is for development, migrations and all automated tests. **`owezy`** (prod) is for real use and only gets migrations that have passed on dev. No Docker needed.

## Milestones

### ✅ M1. Setup
**Goal:** `npm run dev` in `web/` shows a themed placeholder page that follows the system light/dark setting. `lint`, `typecheck`, `test` and `build` pass. The owner has written steps for creating Supabase and Google sign-in.
**Scope:** in: scaffold, styling, providers, Supabase client helpers, env validation, scripts. Out: any feature.
**Notes:** moved to Next.js 16, because 15.x bundles a vulnerable postcss that only 16 fixes. Supabase uses the new publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Done as a single commit (`7c1bbba`), before the multi-commit rule existed.
- [x] Scaffold Next.js 16 + Tailwind 4 + ESLint; Next 16 `AGENTS.md` kept
- [x] shadcn/ui (`radix-nova`), indigo accent, `positive`/`negative` money tokens, Geist font
- [x] Theme (next-themes, system default) and TanStack Query providers; 480px mobile-first column
- [x] `env.ts` (zod) + Supabase browser/server clients; `.env.example`
- [x] Vitest + `test`/`typecheck` scripts; owner setup steps in `web/README.md`

### ✅ M2. Core logic port + tests
**Goal:** `web/src/core/` holds pure TypeScript versions of all the money, split and balance logic v1 needs. A Vitest suite covers every applicable case in `test_logic.py` plus new ones, and `npm run test` passes. Nothing in the app uses it yet.
**Scope:** in: `money`, `names`, `splits`, `balances` (incl. pairwise debts) and `simplify`, with their tests and a lint guard. Out: `build_export` (no export in v1), any React/Next/Supabase code, UI, and the database. The Python CLI is not changed.
**Design notes:**
- People are identified by **member id strings**, not names. An ordered `memberIds` array defines participant order (equal-split leftover paise go to the first ones, same as today).
- Simplify ties are broken by that member order instead of by name. Still deterministic, and it stays stable when names change.
- `formatInr` uses Indian grouping (`₹12,00,000.00`). `parseAmount` accepts `,` and `₹` like `parse_amount`.
- Errors are thrown as `Error`s with the same user-facing messages as the Python version.
- [x] `core/money.ts`: `parseAmount`, `formatInr` + tests
- [x] `core/names.ts`: `validateNames`, `addNames` + tests
- [x] `core/splits.ts`: `splitEqual`, `validateUnequal` + tests
- [x] `core/balances.ts`: `computeBalances`, `pairwiseDebts` + tests
- [x] `core/simplify.ts`: `simplifyDebts` + tests (settles everyone to zero; README's greedy-suboptimal example is pinned)
- [x] ESLint rule: `src/core/**` may not import `react`, `next`, `@supabase/*` or `@/` app code

### ✅ M3. Database: schema, RLS and RPC
**Goal:** running the migrations in `web/supabase/migrations/` on a fresh `owezy-dev` database builds the whole schema. A pgTAP test suite (`supabase test db`) proves: a non-member sees and changes nothing, RPCs reject bad shares, members from another group and stale edits, and duplicate names are rejected regardless of capitals.
**Scope:** in: Supabase CLI setup, tables, constraints, RLS, a trigger that creates profiles, the RPCs from the data model, SQL tests, generated TypeScript types. Out: any UI or app code calling the database, and applying to prod.
**Needs from owner:** both Supabase projects created; the dev project's database connection string in `web/.env.test.local` (gitignored).
**Notes:** `supabase test db` needs Docker even for a remote database, so `scripts/db-test.mjs` runs the pgTAP files over node-postgres instead. pgTAP is created by the runner on dev only, never in migrations.
- [x] Supabase CLI (dev dependency) + `supabase/config.toml`; scripts to push, reset and test against dev
- [x] Migration: tables, keys, unique/check constraints, indexes; `profiles` trigger on sign-up
- [x] Migration: RLS policies (member-of-group helper function)
- [x] Migration: `create_group`, `join_group` RPCs (+ read-only `invite_preview` for the join screen)
- [x] Migration: `create_expense`, `update_expense` (stale check), `delete_expense`/`restore_expense` RPCs
- [x] pgTAP tests for RLS isolation and every RPC rule (written with each migration above) + schema-wide security guards
- [x] Generated `src/lib/supabase/types.ts`

### ✅ M4. Auth and groups
**Goal:** on the dev project, person A signs in, creates a group with placeholder names and shares the invite link. Person B opens it, signs in and claims a name. Both now see the same group and members, and `/` takes each of them back to that group. A Playwright test does this with two browsers.
**Scope:** in: sign-in (Google + email link), sign-out, session refresh proxy, create group, group screen shell (header, switcher, empty "no expenses yet" state), last-group redirect, settings (rename, add/remove member, invite share/copy, leave), join/claim, Playwright setup. Out: adding expenses, balances.
**Notes:** task 3 (group screen) was built before task 2 so creating a group lands on a real page. A separate fix commit (`63864ac`) makes signed-in pages call `connection()` first, after Playwright's server output showed a `Date.now()` prerender error. The owner confirmed real Google and email-link sign-in, and an invite join with a second account.
- [x] Session-refresh proxy + `/login` (Google, email link) + auth callback + sign-out
- [x] `/new` create group (name + member chips)
- [x] `/g/[groupId]` shell: header, group switcher sheet, empty state
- [x] `/` redirect to last group (stored on profile) or `/new`
- [x] Settings: rename, members add/remove (blocked if used), leave
- [x] Invite link share/copy + `/join/[code]` claim or "I'm new"
- [x] Playwright with dev-only test users + two-browser join test

### ✅ M5. Expenses (mobile-first)
**Goal:** on real phones (Android and iPhone) through the dev deployment, members add, edit and delete expenses (equal or unequal, with a date) from the one-screen sheet. The other member sees the changes on returning to the app, and concurrent edits are caught with the conflict message. Playwright covers this on both Android (Chromium mobile emulation) and iPhone (WebKit) engines.
**Scope:** in: a Vercel deployment of the app against `owezy-dev`; phone-sized tap targets across the whole app; expense date and safe retries (database change); group data query; expense list grouped by date; add/edit sheet that stays usable with the phone keyboard open; split picker; optimistic updates with rollback and Retry; delete with Undo; conflict handling; Playwright on two mobile engines. Out: the Balances tab and header summary (M6); pull-to-refresh, offline mode and production deployment (M7); live updates (later add-on).
**Mobile rules for every screen from here on:**
- Tap targets at least 44px tall, inputs at least 16px text (so iPhone doesn't zoom in).
- Respect safe areas (notch, home bar).
- Nothing important hidden behind the on-screen keyboard.
- Amount fields open the number pad. A comma before the last 1–2 digits ("10,50") is a decimal point, never thousands.
- Saves survive flaky networks: the phone generates the expense id, so retries never duplicate. A failed save keeps what you typed and offers Retry.
- Dates show in India time.
**Needs from owner:** a Vercel account connected to the GitHub repo, with the dev env vars; the `*.vercel.app` URL added to `owezy-dev`'s Supabase Redirect URLs (steps in `web/README.md`).
- [x] Dev deployment on Vercel (root `web/`, region `bom1`, `owezy-dev` env vars) + owner setup steps
- [x] Playwright mobile projects: Android (Chromium, Pixel-sized, touch) and iPhone (WebKit); existing e2e passes on both
- [x] Phone-sized tap targets and safe-area insets across existing screens (sign-in, groups, settings, join)
- [x] Migration: `expenses.expense_date` (default today in India time) and client-supplied ids so a retried `create_expense` never duplicates; pgTAP; regenerated types
- [x] Group bundle query hook (group + members + expenses + shares) with TanStack Query, refetching when the app regains focus
- [x] Expense list grouped by date, with the "your effect" amount per row
- [x] Add sheet: amount (number pad, comma-decimal rule), description, date, paid by, equal split, "you get back" preview; optimistic with Retry; keyboard-safe on both engines
- [x] Split picker: choose members, unequal mode with "₹X left" and the Save rule
- [x] Edit an expense, with stale-edit conflict handling
- [x] Delete with Undo toast
- [x] Playwright on both engines: add/see on refocus, unequal split, conflict, retry without duplicates, tap-target sizes

### ✅ M6. Balances view
**Goal:** the group screen shows your net summary ("You get back / You owe / All settled"), plus a Balances tab with raw pairwise debts and a Simplify toggle showing "N → M payments". All numbers come from `core/` and match it.
**Scope:** in: header summary, Balances tab, Simplify toggle and tests. Out: settle-up payments.
- [x] Header net summary from `computeBalances`
- [x] Balances tab: raw pairwise debts
- [x] Simplify toggle + payment-count line
- [x] Tests for view numbers vs `core/` on a fixture group

### ✅ M7. Polish and deploy
**Goal:** the app is live on a `*.vercel.app` URL against the prod Supabase project. It installs to a phone's home screen, both test users can use it on their phones, and it meets the Lighthouse targets in REVIEW.md.
**Scope:** in: PWA manifest and real icons (replacing Next's default favicon), loading/empty/error states, pull-to-refresh, switching Vercel production to the prod project, prod migrations and sign-in URLs, Playwright against the preview deploy, Lighthouse fixes. Out: the add-ons now planned for v2 (M8 onward).
- [x] App icon, favicon and `manifest.ts`
- [x] Loading, empty and error states across screens
- [x] Apply migrations to prod; prod sign-in redirect URLs (owner steps)
- [x] Switch the Vercel production environment to the `owezy` (prod) project; preview deployments stay on `owezy-dev`
- [x] Pull-to-refresh in the installed app (iPhone home-screen apps have none built in)
- [x] Playwright against preview; Lighthouse fixes; phone test

## Verification
- `npm run test`: Vitest runs the applicable ported cases from `test_logic.py` (splits, rounding, netting, settle-to-zero) plus the new ones.
- RLS check: pgTAP tests on `owezy-dev` show that a user who is not in a group gets nothing back from that group's tables.
- Playwright, with two browser sessions (A and B) in the same group:
  - A adds an expense; B returns to the tab and sees it.
  - Both edit the same expense; the second save gets the conflict message.
  - B joins through the invite link and claims a placeholder name.
- Manual: open the Vercel link on a phone, add it to the home screen, and add an expense in 3 taps plus typing.

## Open follow-ups
- [ ] iPhone home-screen check (REVIEW.md M7): add to the home screen from Safari, then check it opens full-screen into the group, pull-to-refresh works, the clock and battery are readable, and nothing sits under the notch or home bar. Android is verified; the iPhone engine is covered by Playwright (WebKit), but not on a real device.
- [ ] Lighthouse on the live site after M8 (REVIEW.md M8): Chrome DevTools, mobile, on the login and group pages; targets Performance ≥ 90, Accessibility ≥ 95. The owner will run it later.

## v2 plan (after v1)
v1 works, but it looks like a template: stock shadcn styling, a plain-text summary, text-only rows and a bare balances list. v2 starts with a design pass, then adds features **one milestone at a time, each only after the owner's go-ahead**. The order below is a suggestion and can be changed before a milestone starts.

### ✅ M8. A better UI
**Goal:** every screen is rebuilt in the direction the owner chose (mostly design A, plus C's sharper balance box and new UX, recorded below), in light and dark mode on Android and iPhone:
- Opening a group answers "where do I stand, and with whom?" at a glance.
- The default group follows how often and how recently you open each one.
- A half-filled expense can be minimised and resumed.

All existing tests still pass (updated where the UI changed), and the mobile rules (44px taps, keyboard-safe sheets, safe areas, Lighthouse ≥ 90/95) still hold.
**Scope:** in: design tokens, avatars (Google photo or letter), the frecency default group, whole-rupee amounts, and restyled group, balances and add screens with the UX below, the Pay/Remind "coming soon" UI, minimise/resume, the other screens restyled, light motion, screenshot tests. Out: real payments or reminders (M9); categories and the rest of v2.
**Owner's decisions (2026-11-24, from the mockups in [design/m8-directions](design/m8-directions/README.md)):**
- **Group screen:**
  - Opens the group you open most often, weighted toward recent opens. A dropdown switches groups.
  - Top right: the first 3 member avatars (you first), a ⋯ that opens a sheet listing all members, and the settings gear.
  - Avatars are the Google photo when there is one, else a coloured letter, everywhere a person appears.
  - The balance box is filled with the brand colour, with ~8px corners and no lines between the people in it.
  - Expense rows have a round payer avatar; the rest is as in design A. The members chip row goes away.
- **Balances (as in A):**
  - The Simplify switch on top. On turns both sections into payments: yours under "You and each person", the rest under "Between others".
  - Cards in "You and each person" have **Pay** (you owe) and **Remind** (they owe you), both "Coming soon" until M9.
- **Add expense (as in A):**
  - Order: amount, what for, Paid by (defaults to you; expands inline; picking collapses it) with a Today chip beside it, an Equally | Unequally toggle, then the people list, always visible.
  - Unequal: once all but one person have amounts, the one untouched field fills with what's left ("auto"); typing in it makes it manual.
  - Minimise: the collapse button, swipe-down or tapping outside keep the draft on the phone until it's saved or discarded. A "Continue expense" bar reopens it. Cancel discards, with a confirm.
- **Colours** (not green, no purple, no gradients):
  - Cobalt blue brand (`#2457D6` light, `#7FA4FF` dark) on a cool grey / blue-black page.
  - "You get back" is cobalt and "you owe" is burnt orange (`#C2410C` / `#FF9A5C`).
  - Plus Jakarta Sans. Whole rupees drop ".00".
- **Default group algorithm:** each open adds 1 to a score on your member row, after decaying it with a 7-day half-life; re-opens within 30 minutes don't count. Home opens the highest decayed score, and the switcher uses the same order.
- [x] Design direction: mockups made; the owner picked a mix (above)
- [x] Design tokens (palette, font, radii; `ui/` primitives restyled) + a test that every text/background pair is ≥ 4.5:1
- [x] Avatars: `members.avatar_url` (migration, trigger, backfill, pgTAP) + `Avatar` component everywhere
- [x] Frecency default group: migration + `record_group_open` RPC + `core/frecency.ts` + home and switcher order
- [x] Whole rupees without ".00" (`formatInr` option)
- [x] Group screen: header avatars + ⋯ members sheet + gear, balance box, avatar rows
- [x] Balances: Simplify on top, "You and each person" with Pay/Remind (coming soon), "Between others"
- [x] Add sheet layout: amount, what for, Paid by (inline) + date chip, split toggle, people list
- [x] Unequal auto-fill of the last untouched person (`autoFillRemainder` in `core/splits.ts`)
- [x] Minimise and resume the add/edit sheet (draft kept on the phone)
- [x] Sign-in, new group, join, settings, error and empty screens restyled
- [x] Light motion, off with "reduce motion"
- [x] Screenshot tests, full e2e on both engines, tap sizes, Lighthouse, prod migration, owner's phone check (Lighthouse left to the owner, see Open follow-ups)

### ⬜ M9. Settle up (and pay with UPI)
**Goal:** from Balances, either person can record "Rahul paid Asha ₹700", and everyone's balances drop accordingly. If the person being paid has added a UPI ID, **Pay with UPI** opens the payer's UPI app (GPay, PhonePe, Paytm…) with the amount filled in; after paying, they confirm it in Owezy. Payments show in the expense list and can be edited or deleted with Undo, like expenses.
**Scope:** in: a payments table and RPCs (RLS, pgTAP, idempotent ids, version check), payments counted in `core/` balances, a Settle up sheet (amount pre-filled from the balance, partial amounts allowed), an optional UPI ID per user (settings), a `upi://pay` deep link, payment rows in the list. Out: payment gateways or automatic confirmation (UPI apps don't report back to a web app, so the payer confirms by hand); other currencies.
- [ ] Migration: `payments` (or a payment kind of expense) + RPCs + RLS + pgTAP; types
- [ ] `core/`: balances, pairwise debts and simplify include payments (unit tests, including "settling everything brings all to zero")
- [ ] UPI ID on the user's profile (optional, validated `name@bank`), editable in settings
- [ ] Settle up sheet from Balances: who pays whom, amount (prefilled, editable), date; optimistic with Undo
- [ ] Pay with UPI: deep link with payee, name, amount and note; "Did the payment go through?" confirm step
- [ ] Payment rows in the list (tap to edit/delete); summary and balances update at once
- [ ] Playwright on both engines: settle in full, settle partly, Undo, two people settling at once

### ⬜ M10. Open sign-in to everyone
**Goal:** anyone with an invite link can sign in with Google without being added as a test user. Owezy has a privacy policy and terms page, and (optionally) its own domain.
**Scope:** in: `/privacy` and `/terms` pages, an optional custom domain (owner buys it; Vercel + Supabase + Google URLs updated), publishing the Google app, a custom email sender for sign-in links (Supabase's built-in one only sends a few per hour). Out: anything else.
- [ ] `/privacy` and `/terms` pages (plain language: what's stored, who can see it, how to delete your data)
- [ ] Optional own domain: owner steps (buy, connect to Vercel, update Supabase Site/Redirect URLs and Google)
- [ ] Publish the Google app: Branding page (home page, privacy, terms, authorized domain), owner steps
- [ ] Email sign-in links via a real email service (e.g. Resend's free tier) set as Supabase's SMTP, owner steps
- [ ] "Delete my account" in settings (needed for the privacy policy to be honest), with a pgTAP test

### ⬜ M11. Live updates
**Goal:** when a friend adds, edits, deletes or settles, it appears on everyone's open screen within about 2 seconds, with no need to switch away or pull to refresh.
**Scope:** in: Supabase Realtime on the open group's rows (respecting RLS), refreshing the cached group data, reconnecting after the phone sleeps, a quiet "Updated" cue. Out: typing indicators or presence; chat.
- [ ] Realtime authorization for the group's tables (only members get changes), tested on dev
- [ ] Subscribe on the group screen; refresh the bundle on change (batched); resubscribe after sleep or reconnect
- [ ] Your own changes don't flicker (optimistic row reconciled, not duplicated)
- [ ] Playwright: two phones; B sees A's change without any focus or pull

### ⬜ M12. Categories, notes and receipt photos
**Goal:** an expense can have a category (with an icon, suggested from the description, e.g. "Uber" → Travel), a note, and a receipt photo that every member can open full-screen. Adding an expense without them is still 3 taps.
**Scope:** in: a fixed category list with icons, auto-suggest, an optional note, one photo per expense (resized on the phone, stored in a private Supabase Storage bucket readable only by group members). Out: custom categories, spending charts, receipt scanning or OCR.
- [ ] Migration: category + note columns, Storage bucket with member-only policies, pgTAP
- [ ] Category picker with icons + suggestion from the description (unit-tested keyword map)
- [ ] Note field
- [ ] Receipt photo: take or pick, shrink on the phone, upload with progress, view full-screen, replace or remove
- [ ] Icons on list rows; Playwright on both engines (including that a non-member can't open a receipt)

### ⬜ M13. Activity feed and notifications
**Goal:** each group has an activity feed ("Rahul added Dinner ₹900 · 2h ago", "Neha settled ₹700 with you"). Members who opt in get a phone notification when something involves them, on Android and on iPhones that installed the app (iOS 16.4+).
**Scope:** in: an activity log written by the RPCs, a feed screen, web push (opt-in per user and group), notifications for "an expense involving you" and "someone settled with you". Out: email digests, reminders to pay (maybe later).
- [ ] Migration: activity table written inside the existing RPCs (atomic), RLS, pgTAP
- [ ] Activity feed screen per group (paged)
- [ ] Web push: keys (owner steps), subscription storage, opt-in flow and settings toggle
- [ ] Sending: a database-triggered function sends the push; links open the right group
- [ ] Tests: the feed in Playwright; push sending with a fake push endpoint

### ⬜ M14. Offline mode
**Goal:** with no signal (e.g. on a trip), the installed app opens, shows the last-loaded groups, and lets you add, edit or delete expenses. They're marked "waiting to sync" and sync by themselves when the connection returns, never duplicating. Conflicts use the existing "someone else changed this" flow.
**Scope:** in: a service worker caching the app shell, persisted query cache, a queue of offline changes (the ids are already client-made, so retries can't duplicate), an offline banner and per-row sync state. Out: creating groups or joining offline.
- [ ] Service worker: app shell and static assets (updates without getting stuck on an old version)
- [ ] Persist the TanStack cache (groups, bundles) to IndexedDB
- [ ] Offline mutation queue with replay on reconnect; conflict and "deleted meanwhile" handling
- [ ] Offline banner and "waiting to sync" rows
- [ ] Playwright: go offline, add/edit/delete, come back online, everything lands once

### ⬜ M15. App-store builds (decide later)
**Goal:** Owezy is in the Play Store (and, if wanted, the App Store), built from the same code.
**Scope:** in: wrapping the web app with Capacitor (or a Trusted Web Activity for Android), native push and invite deep links, store listings. Out: a separate native rewrite.
**Needs from owner:** a Google Play developer account (one-time fee); an Apple developer account (yearly fee) for iPhone.
- [ ] Decide: Android-only TWA vs Capacitor for both; costs and effort written up for the owner
- [ ] Android build, deep links for `/join/<code>`, Play internal testing
- [ ] (If iPhone) App Store build and TestFlight
