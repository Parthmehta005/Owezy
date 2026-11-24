# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Offline, in-memory terminal expense splitter (Splitwise-like) in Python. No server, database, or persistence between sessions. See README.md for user-facing behavior and the debt-simplification explanation.

## Commands

```bash
pip install -r requirements.txt          # rich, questionary
python main.py                           # run the app (needs a real terminal; IDE run consoles may break questionary checkboxes)
python -m unittest test_logic -v         # all tests
python -m unittest test_logic.TestSimplifyDebts.test_chain_collapses_to_one_payment   # single test
```

The Python CLI has no linter, formatter, or build step.

### Web app (`web/`, run from that folder)

```bash
npm run dev | lint | typecheck | test | build
npx vitest run src/core/money.test.ts    # single test file; add -t "name" for one test
npm run test:e2e                         # Playwright e2e on two projects: android (Edge, Pixel 7) + iphone (WebKit; needs `npx playwright install webkit` once). Dev project; temp users via e2e/support/dev-users.ts
npx playwright test --project=iphone      # one engine only
E2E_BASE_URL=https://<preview> npm run test:e2e   # same tests against a deployment (must use the dev project; guard in e2e/support/remote-guard.ts)
```

- **Next.js 16** (not 15): read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next code (see `web/AGENTS.md`, which `next dev` regenerates; keep it committed). `cacheComponents` and `partialPrefetching` are on in `next.config.ts`.
- UI: shadcn/ui (`radix-nova` preset, Radix primitives). Add components with `npx shadcn@4.23.0 add <name>`. Class merging comes from shadcn's `cn` package. Theme tokens live in `src/app/globals.css`; use `text-positive` / `text-negative` for money owed to or by the user.
- Env vars are validated in `src/lib/env.ts`; Supabase clients are in `src/lib/supabase/{client,server}.ts`.
- **Mobile-first** (mostly phones, Android + iPhone): see M5's "Mobile rules" in ROADMAP.md. In e2e, import `test`/`expect` from `e2e/support/test.ts` (it handles Vercel's preview login wall) and open extra people's phones with `phoneFor()`; plain `browser.newContext()` loses the device emulation. Pages are server-rendered, so wait for hydration (e.g. the `/rest/v1/rpc/record_group_open` request on the group screen) before simulating events.
- Auth: `src/proxy.ts` refreshes the session and redirects signed-out visitors to `/login?next=`; pages read the user via `getCurrentUser()` (`src/lib/auth/user.ts`), which calls `connection()` first because JWT checks read the clock and would break prerendering. Supabase query builders are lazy: always `await` (or `.then()`) them. Server actions must `redirect()` to a page, not to `/` (a route handler).
- Database (dev project only, no Docker): `npm run db:push | db:reset | db:test | db:types`. Every schema change is a **new** migration (`npx supabase migration new <name>`), never an edit to one already pushed. Follow it with `db:push`, pgTAP tests in `supabase/tests/` (each file `begin; ... rollback;`), then `db:types`.
- DB conventions: RLS on every table; expenses/shares are written only via security-definer RPCs; every new function must `revoke execute ... from public, anon` (Supabase grants anon by default) and set `search_path = ''`. `05_security_guards_test.sql` enforces this. RPC errors use SQLSTATE codes (42501, 22023, 23505, P0002, PT409 → HTTP 409 for stale `expected_version`).

## Architecture

Strict layering, with `main.py` as the only module that touches the filesystem or browser:

- `logic.py`: pure functions, no I/O. Owns the `Transaction` dataclass, amount parsing/formatting, split validation, balances, pairwise "before" debts, greedy `simplify_debts`, and `build_export`. Keep it free of printing/input so it stays unit-testable and reusable by another front end.
- `ui.py`: all terminal interaction (questionary prompts, rich tables). Validators call back into `logic` (e.g. `parse_amount`, `validate_names`) so validation rules live in one place. `_ask` converts questionary's `None` (Ctrl+C) into `KeyboardInterrupt`, which `main.main()` catches.
- `visualize.py`: pure function `build_html(participants, before, after)` returning a self-contained HTML page with inline SVG (people placed on a circle). No external libraries.
- `main.py`: session flow (participants → transaction loop with add/delete-last/finish → optional simplify, graphs, JSON export). Writes `owezy_graphs.html` and `owezy_export.json` to the CWD.

Key invariants:

- All money is integer **paise** (INR only). Never introduce floats; convert only at display time via `logic.format_inr`.
- `Transaction.shares` must sum exactly to `total`. Equal-split leftover paise go to the first selected participants in participant order.
- Balance `net = paid - share`; balances always sum to 0 (`simplify_debts` raises otherwise).
- Data shapes passed between modules: balances are `{name: {"paid", "share", "net"}}`; "before" debts are `{(debtor, creditor): paise}`; settlements are `[(debtor, creditor, paise), ...]`.
- Greedy simplification sorts by amount desc then name for deterministic ties; it is intentionally not optimal (min-payments is NP-hard, documented in README).

## Repo notes

- `owezy_export.json`, `owezy_graphs.html` (and the pre-rename `splitwise_*` names) and `__pycache__/` are gitignored; they are generated in the CWD on each run.
- **ROADMAP.md** is the plan and progress tracker for the Next.js + Supabase web app being built in `web/`; **REVIEW.md** holds the per-commit checks and each milestone's checklist.

## Milestone workflow (web app)

- Work one milestone at a time, only within its **Goal** and **Scope** in `ROADMAP.md`; wait for the owner's go-ahead before starting the next one.
- Make **several small commits per milestone**, normally one per ROADMAP task. Each must stand alone (reviewable, revertable, bisectable), pass `lint`/`typecheck`/`test`, start with the milestone tag (`M2: ...`), and tick its ROADMAP task in the same commit. Tick REVIEW.md items as they are verified.
- Automated database tests and migrations target the `owezy-dev` Supabase project only (no Docker); prod gets migrations only after they pass on dev, via `npm run db:push:prod` (dry run; `-- --apply` to apply; reads `web/.env.prod.local`). Never run tests or create test users against prod.
