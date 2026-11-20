# Review checklist

Run this before committing each milestone in [ROADMAP.md](ROADMAP.md). A milestone is done only when everything below for it passes.

## Every milestone

- [ ] `npm run lint`, `tsc --noEmit` and `npm run test` pass
- [ ] No secrets committed (`.env*` is gitignored; only `.env.example` is tracked)
- [ ] The milestone's checkbox in `ROADMAP.md` is ticked
- [ ] One focused commit for the milestone

## M1. Setup

- [ ] App starts with `npm run dev`.
- [ ] Env vars are documented in `.env.example`.
- [ ] Dark/light theme follows the system setting.
- [ ] No unused boilerplate.

## M2. Core logic

- [ ] Every case in `test_logic.py` has a matching Vitest test.
- [ ] Money is integer paise only (no floats).
- [ ] Leftover paise go to members in order.
- [ ] Balances sum to 0.
- [ ] Settlements bring everyone to zero.
- [ ] `core/` imports no React or Supabase code.

## M3. Schema/RLS/RPC

- [ ] RLS is on for every table.
- [ ] A non-member reads 0 rows and can't write.
- [ ] RPCs reject shares ≠ total, members from another group, and edits based on an old `updated_at`.
- [ ] Duplicate names are rejected regardless of capitals.
- [ ] Migrations apply cleanly to a fresh database.

## M4. Auth & groups

- [ ] Google and email-link sign-in both work.
- [ ] Sign-out works.
- [ ] `/` opens the last group, or "create group" if there is none.
- [ ] The invite link works in a fresh browser.
- [ ] Claiming a placeholder links it to the right user, and a placeholder can't be claimed twice.
- [ ] Removing a member is blocked if any expense uses them.

## M5. Expenses

- [ ] Add takes 3 taps plus typing.
- [ ] Unequal Save stays disabled until the shares add up exactly.
- [ ] Optimistic add/edit/delete rolls back on a server error.
- [ ] Undo restores a deleted expense.
- [ ] Two users editing the same expense: the second save shows the conflict message.
- [ ] The number pad opens on phones.

## M6. Balances

- [ ] Raw debts match `pairwise_debts`.
- [ ] The simplified view matches `simplify_debts` and shows "N → M payments".
- [ ] The header summary matches the net balance.
- [ ] Amounts use the `en-IN` format.

## M7. Polish & deploy

- [ ] Lighthouse mobile scores: Performance ≥ 90, Accessibility ≥ 95.
- [ ] Installs as a PWA on Android/iOS.
- [ ] Vercel and Supabase run in Mumbai.
- [ ] Production sign-in redirect URLs are set.
- [ ] Playwright two-user tests pass against the preview deploy.
