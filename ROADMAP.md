# Roadmap: SplitwiseLite web app (v1)

Source of truth for the v1 build. Tick a milestone only after it passes its checklist in [REVIEW.md](REVIEW.md).

## Context
SplitwiseLite today is a single-user, in-memory Python CLI (`main.py`, `ui.py`, `logic.py`, `visualize.py`). The goal is for it to be a proper app that several people use at the same time, with a simple, elegant UI that needs as few taps as possible, and a path to mobile later.

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
- `expenses(id, group_id, description, payer_member_id, total_paise bigint, split_type, created_by, created_at, updated_at, deleted_at null, version)`. Deleting sets `deleted_at` (a soft delete), which makes Undo possible. `version` goes up on every change.
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
- Data refreshes when you come back to the app or tab, and on pull-to-refresh.
- Vercel and Supabase sit in the same Mumbai region.
- Heavy code (the sheets) loads only when needed.

## How milestones are worked

- Each milestone has a **Goal** (what is demonstrably true when it is done), a **Scope** (what is in and out), and **Tasks**.
- Work only inside the current milestone's scope. Anything else goes in "Not in v1" or a later milestone; it is not added on the side.
- Each task is one commit, or a few if it is large. Every commit makes sense on its own, passes `lint`, `typecheck` and `test`, starts with the milestone tag (e.g. `M2: ...`), and ticks its task here in the same commit. This keeps `git bisect` and review simple.
- A milestone is ticked only when its Goal is shown to work and its section in [REVIEW.md](REVIEW.md) passes. Then stop and wait for the owner's go-ahead.
- Environments: two Supabase projects. **`splitwiselite-dev`** is for development, migrations and all automated tests. **`splitwiselite`** (prod) is for real use and only gets migrations that have passed on dev. No Docker needed.

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

### ⬜ M3. Database: schema, RLS and RPC
**Goal:** running the migrations in `web/supabase/migrations/` on a fresh `splitwiselite-dev` database builds the whole schema. A pgTAP test suite (`supabase test db`) proves: a non-member sees and changes nothing, RPCs reject bad shares, members from another group and stale edits, and duplicate names are rejected regardless of capitals.
**Scope:** in: Supabase CLI setup, tables, constraints, RLS, a trigger that creates profiles, the RPCs from the data model, SQL tests, generated TypeScript types. Out: any UI or app code calling the database, and applying to prod.
**Needs from owner:** both Supabase projects created; the dev project's database connection string in `web/.env.test.local` (gitignored).
**Notes:** `supabase test db` needs Docker even for a remote database, so `scripts/db-test.mjs` runs the pgTAP files over node-postgres instead. pgTAP is created by the runner on dev only, never in migrations.
- [x] Supabase CLI (dev dependency) + `supabase/config.toml`; scripts to push, reset and test against dev
- [x] Migration: tables, keys, unique/check constraints, indexes; `profiles` trigger on sign-up
- [x] Migration: RLS policies (member-of-group helper function)
- [x] Migration: `create_group`, `join_group` RPCs (+ read-only `invite_preview` for the join screen)
- [x] Migration: `create_expense`, `update_expense` (stale check), `delete_expense`/`restore_expense` RPCs
- [ ] pgTAP tests for RLS isolation and every RPC rule
- [ ] Generated `src/lib/supabase/types.ts`

### ⬜ M4. Auth and groups
**Goal:** on the dev project, person A signs in, creates a group with placeholder names and shares the invite link. Person B opens it, signs in and claims a name. Both now see the same group and members, and `/` takes each of them back to that group. A Playwright test does this with two browsers.
**Scope:** in: sign-in (Google + email link), sign-out, session refresh proxy, create group, group screen shell (header, switcher, empty "no expenses yet" state), last-group redirect, settings (rename, add/remove member, invite share/copy, leave), join/claim, Playwright setup. Out: adding expenses, balances.
- [ ] Session-refresh proxy + `/login` (Google, email link) + auth callback + sign-out
- [ ] `/new` create group (name + member chips)
- [ ] `/g/[groupId]` shell: header, group switcher sheet, empty state
- [ ] `/` redirect to last group (stored on profile) or `/new`
- [ ] Settings: rename, members add/remove (blocked if used), leave
- [ ] Invite link share/copy + `/join/[code]` claim or "I'm new"
- [ ] Playwright with dev-only test users + two-browser join test

### ⬜ M5. Expenses
**Goal:** in a shared group, members add, edit and delete expenses from the one-screen sheet (equal and unequal). The other member sees the changes on returning to the tab. Concurrent edits are caught with the conflict message. Playwright covers these.
**Scope:** in: group data query, expense list grouped by date, add/edit sheet, split picker, optimistic updates with rollback, delete with Undo, conflict handling. Out: the Balances tab and the header summary (M6).
- [ ] Group bundle query hook (group + members + expenses + shares) with TanStack Query
- [ ] Expense list grouped by date, with the "your effect" amount per row
- [ ] Add sheet: amount, description, paid by, equal split (optimistic)
- [ ] Split picker: choose members, unequal mode with "₹X left" and the Save rule
- [ ] Edit an expense, with stale-edit conflict handling
- [ ] Delete with Undo toast
- [ ] Playwright: add/see on refocus, unequal split, conflict

### ⬜ M6. Balances view
**Goal:** the group screen shows your net summary ("You get back / You owe / All settled"), plus a Balances tab with raw pairwise debts and a Simplify toggle showing "N → M payments". All numbers come from `core/` and match it.
**Scope:** in: header summary, Balances tab, Simplify toggle and tests. Out: settle-up payments.
- [ ] Header net summary from `computeBalances`
- [ ] Balances tab: raw pairwise debts
- [ ] Simplify toggle + payment-count line
- [ ] Tests for view numbers vs `core/` on a fixture group

### ⬜ M7. Polish and deploy
**Goal:** the app is live on a `*.vercel.app` URL against the prod Supabase project. It installs to a phone's home screen, both test users can use it on their phones, and it meets the Lighthouse targets in REVIEW.md.
**Scope:** in: PWA manifest and real icons (replacing Next's default favicon), loading/empty/error states, Vercel project and env vars, prod migrations and sign-in URLs, Playwright against the preview deploy, Lighthouse fixes. Out: everything in "Not in v1".
- [ ] App icon, favicon and `manifest.ts`
- [ ] Loading, empty and error states across screens
- [ ] Apply migrations to prod; prod sign-in redirect URLs (owner steps)
- [ ] Vercel project (region `bom1`) connected to GitHub, with env vars
- [ ] Playwright against preview; Lighthouse fixes; phone test

## Verification
- `npm run test`: Vitest runs the applicable ported cases from `test_logic.py` (splits, rounding, netting, settle-to-zero) plus the new ones.
- RLS check: pgTAP tests on `splitwiselite-dev` show that a user who is not in a group gets nothing back from that group's tables.
- Playwright, with two browser sessions (A and B) in the same group:
  - A adds an expense; B returns to the tab and sees it.
  - Both edit the same expense; the second save gets the conflict message.
  - B joins through the invite link and claims a placeholder name.
- Manual: open the Vercel link on a phone, add it to the home screen, and add an expense in 3 taps plus typing.

## Not in v1 (planned add-ons)
- Live updates (Supabase Realtime)
- Settle-up payments and a UPI pay button. Until this exists, there is no way to record that someone paid a debt back.
- Categories, notes and receipt photos
- Activity feed and notifications
- Offline mode
- Native app-store builds
