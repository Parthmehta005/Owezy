# Review checklist

Used with [ROADMAP.md](ROADMAP.md). The per-commit checks apply to every commit. A milestone's own section is ticked here as each item is verified, and the milestone is done only when all of it passes.

## Every commit

- `npm run lint`, `npm run typecheck` and `npm run test` pass (run from `web/`)
- Does one thing that makes sense on its own; it could be reverted or bisected alone
- Message starts with the milestone tag (`M2: ...`) and says what changed and why
- The matching task in `ROADMAP.md` is ticked in the same commit
- No secrets: `.env*` is gitignored and only `.env.example` is tracked
- Stays inside the current milestone's scope

## End of every milestone

- The milestone's **Goal** in `ROADMAP.md` is shown to work (command output or steps written in the final commit or report)
- Every item in its section below is ticked
- `npm run build` passes
- Pushed to GitHub; then stop and wait for the owner's go-ahead

## M1. Setup

- [x] App starts with `npm run dev`.
- [x] Env vars are documented in `.env.example`.
- [x] Dark/light theme follows the system setting.
- [x] No unused boilerplate. (Next's default `favicon.ico` stays until the real icon in M7; shadcn's `button.tsx` is first used in M4.)

## M2. Core logic

- [x] Every case in `test_logic.py` has a matching Vitest test, except `build_export` (no export in v1). (31 of 32 ported, each tagged with its Python test name.)
- [x] Money is integer paise only (no floats). (`assertPaise` guards every amount; formatting uses integer rupees + paise.)
- [x] Leftover paise go to members in order.
- [x] Balances sum to 0.
- [x] Settlements bring everyone to zero. (Also checked on 500 seeded random groups.)
- [x] `core/` imports no React, Next or Supabase code (enforced by an ESLint rule).

## M3. Schema/RLS/RPC

- [x] RLS is on for every table. (`05_security_guards_test.sql` checks every table, including future ones.)
- [x] A non-member reads 0 rows and can't write. (`02_rls_test.sql`; also checked against the live API signed out: 401 on all tables.)
- [x] RPCs reject shares ≠ total, members from another group, and edits based on an old `version`.
- [x] Duplicate names are rejected regardless of capitals.
- [x] Migrations apply cleanly to a freshly reset `owezy-dev` database. (Reset, re-applied 4 migrations, all 131 checks passed.)
- [x] Nothing was applied to the prod project. (The db scripts only read `SUPABASE_DEV_DB_URL`; prod credentials are not on this machine.)

## M4. Auth & groups

- [x] Google and email-link sign-in both work. (Owner tested the real round trip for both, plus joining via invite with a second Google account in a private window.)
- [x] Sign-out works. (From the switcher sheet and from /new; afterwards / goes to /login.)
- [x] `/` opens the last group, or "create group" if there is none. (Also: falls back after leaving, ignores a forged foreign last_group_id.)
- [x] The invite link works in a fresh browser. (Signed out -> /login?next -> back to the invite; Playwright.)
- [x] Claiming a placeholder links it to the right user, and a placeholder can't be claimed twice. (Including a two-user race.)
- [x] Removing a member is blocked if any expense uses them. ("Rahul is part of an expense, so they can't be removed.")

## M5. Expenses

- [x] Add takes 3 taps plus typing. (+, description, Save; the amount is focused with the number pad on open. e2e on both engines.)
- [x] Unequal Save stays disabled until the shares add up exactly. (Counter: left / over / ✓ assigned.)
- [x] Optimistic add/edit/delete rolls back on a server error, keeping what was typed, with Retry. (Add and delete failures are e2e-tested; an edit failure uses the same rollback code, and its conflict path is tested.)
- [x] Retrying a save (or tapping Save twice on a slow network) never creates a duplicate expense. (Including a lost reply; the test fails if the client id is removed.)
- [x] Undo restores a deleted expense. (Also when tapped while the delete is still in flight; checked live on Vercel too.)
- [x] Two users editing the same expense: the second save shows the conflict message. (And is shown the latest version to redo the change.)
- [x] The number pad opens for amounts; "10,50" is read as ₹10.50, never ₹1,050. (inputmode=decimal on every amount field; comma rule unit- and e2e-tested.)
- [x] Every tap target is at least 44px tall (checked by Playwright on every screen). (Including the sheet, both split modes, edit/delete and the Undo toast.)
- [x] Expenses are grouped by their date, shown in India time. (core/dates.ts, tested across the UTC/IST midnight.)
- [x] Playwright passes on both Android (Chromium mobile) and iPhone (WebKit) engines. (17 tests x 2 engines, no server errors.)
- [x] Owner checked on a real phone via the dev deployment: the keyboard never hides Save, nothing sits under the notch or home bar. (Owner tested add, edit, split, delete/Undo on the live dev URL.)

## M6. Balances

- [x] Raw debts match `pairwiseDebts`. (Unit: view helper equals core; e2e: screen equals core run on the database rows, both engines.)
- [x] The simplified view matches `simplifyDebts` and shows "N → M payments". (Fixture: 4 → 3; payments leave every net at zero; mutation-checked.)
- [x] The header summary matches the net balance. (Gets back / owes / all settled; updates the moment an expense is saved.)
- [x] Amounts use the `en-IN` format. (₹1,20,000.00 and ₹1,19,000.00 checked on screen.)

## M7. Polish & deploy

- [x] Lighthouse mobile scores: Performance ≥ 90, Accessibility ≥ 95. (Owner ran Lighthouse in Chrome DevTools on the live prod site: 99 / 100 on both the login and group pages. The remaining unscored hints are Next.js's own polyfills and shared bundle, plus the single 11 KB stylesheet.)
- [ ] Installs as a PWA on Android/iOS. (Android: verified by the owner on the live site; icon, full-screen launch into the group, and pull-to-refresh all work. iPhone: still to check, since the owner has no iPhone yet. Open follow-up, see ROADMAP.)
- [x] Vercel and Supabase run in Mumbai. (Vercel functions in bom1 via vercel.json; both Supabase projects on ap-south-1, prod confirmed when its migrations were applied.)
- [x] Production sign-in redirect URLs are set. (Owner signed in with Google on https://owezy-chi.vercel.app and created a group; it landed in the prod database.)
- [x] Playwright two-user tests pass against the preview deploy. (51 tests x 2 engines on a protected branch preview via the bypass secret; the guard refuses the live site because it uses prod.)

## M8. A better UI

- [ ] The owner chose a direction from the mockups, and the chosen tokens are written in ROADMAP.md.
- [ ] Every screen uses the new tokens and components (no leftover stock styling), in light and dark mode.
- [ ] The group screen shows your total and the people behind it without scrolling, on a small phone (360×640).
- [ ] Add an expense is still 3 taps plus typing, and the number pad still opens straight away.
- [ ] Every text/background pair is ≥ 4.5:1; every tap target ≥ 44px; motion is off with "reduce motion".
- [ ] Screenshot tests cover the key screens in light/dark on both engines; the full e2e suite passes.
- [ ] Lighthouse mobile still ≥ 90 performance, ≥ 95 accessibility.
- [ ] Owner checked it on a phone.

## M9. Settle up

- [ ] Recording a payment lowers both people's balances by exactly that amount; settling every simplified payment brings everyone to zero (unit + e2e).
- [ ] Payments use idempotent ids and the version check, like expenses; a non-member can't create or see them (pgTAP).
- [ ] The UPI link opens a UPI app with the right payee, amount and note (checked on a real Android phone); a missing UPI ID hides the button.
- [ ] Undo works for payments; partial payments work.

## M10. Open sign-in

- [ ] A Gmail account that isn't a test user can sign in on prod.
- [ ] The privacy and terms pages are reachable signed out and linked from sign-in.
- [ ] Email links arrive from the new sender, beyond the old hourly limit.
- [ ] Deleting an account removes the user's profile and sign-in; their group names stay as placeholders, so others' balances still add up (pgTAP).

## M11. Live updates

- [ ] Another member's change shows within ~2 s without switching away (Playwright, two phones, both engines).
- [ ] A non-member receives no realtime events for the group.
- [ ] After the phone sleeps and wakes, updates resume.
- [ ] Your own optimistic changes don't duplicate or flicker.

## M12. Categories, notes, receipts

- [ ] Adding an expense without a category/note/photo is still 3 taps.
- [ ] Category suggestions are unit-tested; photos are resized before upload.
- [ ] A non-member can't read a receipt, even with its URL (Storage policy test).

## M13. Activity and notifications

- [ ] Every add/edit/delete/settle writes exactly one activity row, in the same transaction.
- [ ] Notifications are opt-in, only for things involving you, and open the right group.
- [ ] Works on Android and on an installed iPhone app (iOS 16.4+).

## M14. Offline mode

- [ ] With the network off, the installed app opens and shows the last data.
- [ ] Offline changes sync once on reconnect, never duplicated; conflicts show the usual message.
- [ ] A new deploy reaches users (the service worker doesn't keep an old version forever).

## M15. App-store builds

- [ ] Decision written up and approved by the owner before any build work.
- [ ] Invite links open the installed store app.
