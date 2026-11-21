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

- [ ] Add takes 3 taps plus typing.
- [ ] Unequal Save stays disabled until the shares add up exactly.
- [ ] Optimistic add/edit/delete rolls back on a server error.
- [ ] Undo restores a deleted expense.
- [ ] Two users editing the same expense: the second save shows the conflict message.
- [ ] The number pad opens on phones.

## M6. Balances

- [ ] Raw debts match `pairwiseDebts`.
- [ ] The simplified view matches `simplifyDebts` and shows "N → M payments".
- [ ] The header summary matches the net balance.
- [ ] Amounts use the `en-IN` format.

## M7. Polish & deploy

- [ ] Lighthouse mobile scores: Performance ≥ 90, Accessibility ≥ 95.
- [ ] Installs as a PWA on Android/iOS.
- [ ] Vercel and Supabase run in Mumbai.
- [ ] Production sign-in redirect URLs are set.
- [ ] Playwright two-user tests pass against the preview deploy.
