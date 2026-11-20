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

There is no linter, formatter, or build step configured.

## Architecture

Strict layering, with `main.py` as the only module that touches the filesystem or browser:

- `logic.py`: pure functions, no I/O. Owns the `Transaction` dataclass, amount parsing/formatting, split validation, balances, pairwise "before" debts, greedy `simplify_debts`, and `build_export`. Keep it free of printing/input so it stays unit-testable and reusable by another front end.
- `ui.py`: all terminal interaction (questionary prompts, rich tables). Validators call back into `logic` (e.g. `parse_amount`, `validate_names`) so validation rules live in one place. `_ask` converts questionary's `None` (Ctrl+C) into `KeyboardInterrupt`, which `main.main()` catches.
- `visualize.py`: pure function `build_html(participants, before, after)` returning a self-contained HTML page with inline SVG (people placed on a circle). No external libraries.
- `main.py`: session flow (participants → transaction loop with add/delete-last/finish → optional simplify, graphs, JSON export). Writes `splitwise_graphs.html` and `splitwise_export.json` to the CWD.

Key invariants:

- All money is integer **paise** (INR only). Never introduce floats; convert only at display time via `logic.format_inr`.
- `Transaction.shares` must sum exactly to `total`. Equal-split leftover paise go to the first selected participants in participant order.
- Balance `net = paid - share`; balances always sum to 0 (`simplify_debts` raises otherwise).
- Data shapes passed between modules: balances are `{name: {"paid", "share", "net"}}`; "before" debts are `{(debtor, creditor): paise}`; settlements are `[(debtor, creditor, paise), ...]`.
- Greedy simplification sorts by amount desc then name for deterministic ties; it is intentionally not optimal (min-payments is NP-hard, documented in README).

## Repo notes

- `splitwise_export.json`, `splitwise_graphs.html` and `__pycache__/` are gitignored; they are generated in the CWD on each run.
- **ROADMAP.md** is the plan and progress tracker for the Next.js + Supabase web app being built in `web/`; **REVIEW.md** is the checklist each milestone must pass before it is committed.
