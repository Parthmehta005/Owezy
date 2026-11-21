# Owezy CLI

A small, local, terminal-based expense-sharing app inspired by Splitwise. You enter who paid for what and how it was split, and the app shows everyone's balance and proposes a short list of payments that settles all debts.

The main goal is to understand how debt simplification works with a graph-based approach. Everything runs offline, in memory, with no server or database.

## Features

- Equal and unequal splits among any subset of participants
- Exact money arithmetic using integer paise (no floating-point errors), INR only
- Summary after every transaction, with the option to delete the previous one
- Per-person paid / share / net balance tables
- Debt simplification with a before/after payment count
- Optional JSON export
- Optional before/after graph visualization (local HTML file with inline SVG, opens in your browser)

## Prerequisites

- Python 3.9+ (developed on 3.12)
- A real terminal (Windows Terminal, PowerShell, cmd, macOS Terminal, Linux terminal). The interactive checkboxes may not work in an IDE's "Run" console.

## Setup

```bash
pip install -r requirements.txt
```

Optionally use a virtual environment first:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
```

Dependencies: `rich` (tables and colors) and `questionary` (arrow-key menus and spacebar checkboxes). Everything else is the standard library.

## Usage

```bash
python main.py
```

1. Enter names separated by spaces, e.g. `Parth Rahul Aditi`. Names cannot contain spaces, you need at least 2, and duplicates (case-insensitive) are rejected.
2. For each transaction, enter a description, choose who paid, and enter the total. If the payer isn't in the group yet, pick **+ Add new person** at the bottom of the "Who paid?" list to add them on the spot.
3. Select who shared the expense (arrow keys to move, **space** to toggle, **enter** to confirm). The payer does not have to be included. The split is equal by default. To split unequally, also tick **Split unequally** at the bottom of the list.
4. For an unequal split, enter each person's share. They must add up exactly to the total. Zero shares are allowed.
5. The summary is shown after each transaction. Then choose **Add another**, **Add people**, **Delete previous transaction**, or **Finish**. **Add people** takes space-separated names, rejects duplicates of anyone already in the group, and makes the new people available in later transactions.
6. After finishing, choose whether to simplify debts and whether to export JSON (`owezy_export.json`).

### Example

```
Participants: Parth Rahul Aditi

Dinner   paid by Parth, ₹900, equal among Parth, Rahul, Aditi
Cab      paid by Rahul, ₹300, equal among Rahul, Aditi

Net balances:   Parth +₹600.00   Rahul -₹150.00 ... (see the app for the exact table)

Before simplification: Rahul pays Parth ₹300.00, Aditi pays Parth ₹300.00, Aditi pays Rahul ₹150.00 (3 payments)
Simplified:            fewer or equal payments, e.g. Rahul pays Parth ₹150.00, Aditi pays Parth ₹450.00 (2 payments)
Payments needed: 3 -> 2
```

Exact numbers depend on what you enter.

## How debt simplification works

Amounts are in integer paise (1 rupee = 100 paise).

1. **Net balance** of each person = total they paid - total of their shares. Positive means they should receive money, negative means they owe money. All balances sum to exactly 0.
2. **Graph model:** think of a directed, weighted graph where an edge `A -> B (x)` means "A pays B x". The original transactions give one edge from each sharer to the payer. Opposite edges between the same two people are netted. This is the "before" graph.
3. **Greedy matching:** split people into debtors (negative) and creditors (positive). Repeat:
   - take the debtor who owes the most and the creditor who is owed the most,
   - create a payment of `min(debt, credit)` from the debtor to the creditor,
   - reduce both amounts. At least one of them becomes zero and drops out.
4. When no debtors or creditors are left, everyone is at exactly zero. Each step removes at least one person, so there are at most **n - 1 payments** for n people.

Original transactions are never modified. The settlements are a separate, proposed list.

### Trade-offs

The greedy result always settles everyone correctly, but it is **not guaranteed to use the minimum number of payments**. Finding the true minimum is NP-hard: it equals n minus the maximum number of disjoint groups whose balances sum to zero within the group.

Example where greedy is suboptimal. Net balances: A +6, B -3, C -3, D -5, E +5.

- Optimal (3 payments): B pays A 3, C pays A 3, D pays E 5.
- Greedy (4 payments): D pays A 5, B pays E 3, C pays E 2, C pays A 1.

For typical friend-group sizes the greedy result is almost always optimal or within one payment of it. An exact solver is possible for small groups but was left out to keep the project simple.

## Project structure

```
main.py           Entry point: runs the session flow
logic.py          Pure logic, no I/O: money, splits, balances, simplification, export
ui.py             Terminal prompts (questionary) and tables (rich)
visualize.py      Builds the HTML/SVG graph page (pure function, no I/O)
test_logic.py     Unit tests for logic.py
requirements.txt  Dependencies
LICENSE           MIT
```

`logic.py` never prints or reads input, so it can be tested alone and reused by a different front end later.

## Tests

```bash
python -m unittest test_logic -v
```

Tests cover equal and unequal splits, the payer sharing or not sharing an expense, multiple debtors and creditors, already-settled balances, rounding, invalid input, and that applying the proposed payments brings every balance to zero.

## JSON export

`owezy_export.json` contains the participants, transactions, balances, and settlements. All amounts are in paise.

## Graph visualization

After the summary, the app can generate `owezy_graphs.html` and open it in your browser. It shows two graphs side by side: the raw pairwise debts (before) and the simplified settlements (after). Arrows point from payer to receiver and are labelled with the amount. No extra libraries are needed.

## Limitations

- INR only, 2 decimal places, standard thousands grouping (`₹1,200,000.00`)
- People can be added mid-session but not removed or renamed
- No saving between sessions. JSON export is write-only (no re-import)
- Only the previous transaction can be deleted (repeatedly), not an arbitrary one
- Equal-split leftover paise go to the first selected participants in participant order
- Simplification is greedy and not guaranteed to be minimal
- Needs a real terminal for interactive prompts

## License

MIT. See `LICENSE`.
