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
| App | **Next.js 15 (App Router) + React 19 + TypeScript** | One codebase for UI and server. Deploys on Vercel in one click. |
| Styling/UI | **Tailwind CSS + shadcn/ui** (Radix primitives, `vaul` bottom sheets), `lucide-react` icons, `next-themes` for dark mode | Minimal and accessible, with native-feeling bottom sheets on phones. |
| Data/state | **TanStack Query** | Caches data so screens open instantly. Expenses appear the moment you save (optimistic updates). Refetches when you return to the app, so you see friends' changes without live updates. |
| Backend | **Supabase**: Postgres, Auth (Google + magic link), Row Level Security, SQL functions | No custom server to write. RLS keeps each group private. Realtime is built in for when live updates are added. |
| Validation | **Zod** | Shared form and server validation. |
| Tests | **Vitest** for logic, **Playwright** for two-user end-to-end tests | |
| Hosting | **Vercel** (region `bom1`) + **Supabase** (region `ap-south-1`, Mumbai) | Both free. Keeping them in the same region keeps the app fast. |
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
- `expenses(id, group_id, description, payer_member_id, total_paise bigint, split_type, created_by, created_at, updated_at, deleted_at null)`. Deleting sets `deleted_at` (a soft delete), which makes Undo possible.
- `expense_shares(expense_id, member_id, share_paise bigint)`
- **RLS:** you can read and write a group's rows only if you are a member of that group with `user_id = auth.uid()`.
- **SQL functions (RPC)**, each one an atomic transaction:
  - `create_expense`: rejects the save if the shares don't sum exactly to the total, or if a member belongs to a different group.
  - `update_expense(..., expected_updated_at)`: if someone else edited the expense in the meantime, it fails with "This was changed by someone else", and the app reloads it. This handles two people editing at once.
  - `join_group(code, claim_member_id | new_name)`
  - `create_group(name, member_names[])`
- All money is integer paise end to end. JS numbers are exact up to about 9×10¹⁵ paise, far beyond any real amount.

## Code layout (new `web/` folder; the Python CLI stays as it is)
- `web/src/core/money.ts`: ports of `parse_amount` and `format_inr` (`logic.py`)
- `web/src/core/splits.ts`: ports of `split_equal` and `validate_unequal`
- `web/src/core/balances.ts`: ports of `compute_balances`, `pairwise_debts` and `simplify_debts`. Balances are computed on the phone from cached data, so there is no extra server call.
- `web/src/core/*.test.ts`: Vitest ports of every case in `test_logic.py`
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

## Milestones
- [ ] **M1. Setup**: scaffold `web/` and add Tailwind, shadcn and the linter. Manual steps for the owner (with click-by-click instructions): create the Supabase project, create a Google OAuth client, and add the env vars.
- [ ] **M2. Core logic port + tests** (`web/src/core/`).
- [ ] **M3. Schema, RLS and RPC** migrations.
- [ ] **M4. Auth and groups**: sign in, create group, switcher, last-group redirect, settings, invite/join/claim.
- [ ] **M5. Expenses**: list, and the add/edit/delete sheet with optimistic updates.
- [ ] **M6. Balances view**: raw pairwise debts, with the Simplify toggle.
- [ ] **M7. Polish and deploy**: dark mode, PWA manifest, connect Vercel to the GitHub repo, run a test on a phone.

## Verification
- `npm run test`: Vitest runs the ported cases from `test_logic.py` (splits, rounding, netting, settle-to-zero) plus the new ones.
- RLS check: a user who is not in a group gets nothing back from that group's tables.
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
