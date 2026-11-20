"""Pure logic: money handling, splits, balances, debt simplification, export.

All money is stored as integer paise (1 rupee = 100 paise) to avoid
floating-point errors. This module never prints or reads input.
"""

import re
from dataclasses import dataclass

AMOUNT_PATTERN = re.compile(r"(\d+)(?:\.(\d{1,2}))?")


@dataclass
class Transaction:
    description: str
    payer: str
    total: int               # paise
    shares: dict[str, int]   # person -> share in paise (sums to total)


# ---------- Money ----------

def parse_amount(text: str, allow_zero: bool = False) -> int:
    """Convert text like '1,200.50' to paise. Raises ValueError if invalid."""
    cleaned = text.strip().replace(",", "").replace("₹", "")
    match = AMOUNT_PATTERN.fullmatch(cleaned)
    if not match:
        raise ValueError("Invalid amount. Use a positive number with at most 2 decimals, e.g. 1200.50")
    rupees, fraction = match.groups()
    paise = int(rupees) * 100 + int((fraction or "").ljust(2, "0"))
    if paise == 0 and not allow_zero:
        raise ValueError("Amount must be greater than 0.")
    return paise


def format_inr(paise: int) -> str:
    """Format paise as '₹1,200.50' (negative values get a leading '-')."""
    rupees, rest = divmod(abs(paise), 100)
    sign = "-" if paise < 0 else ""
    return f"{sign}₹{rupees:,}.{rest:02d}"


# ---------- Participants ----------

def validate_names(names: list[str]) -> list[str]:
    """Require at least 2 names and no case-insensitive duplicates."""
    if len(names) < 2:
        raise ValueError("Enter at least 2 names.")
    seen = set()
    for name in names:
        key = name.lower()
        if key in seen:
            raise ValueError(f"Duplicate name: {name}")
        seen.add(key)
    return list(names)


def add_names(existing: list[str], new_names: list[str]) -> list[str]:
    """Return existing + new_names, requiring at least 1 new name and no
    case-insensitive duplicates (within the new names or against existing ones)."""
    if not new_names:
        raise ValueError("Enter at least 1 name.")
    seen = {name.lower() for name in existing}
    for name in new_names:
        key = name.lower()
        if key in seen:
            raise ValueError(f"Duplicate name: {name}")
        seen.add(key)
    return list(existing) + list(new_names)


# ---------- Splits ----------

def split_equal(total: int, participants: list[str]) -> dict[str, int]:
    """Split total evenly; leftover paise go one each to the first participants."""
    if not participants:
        raise ValueError("Select at least one participant.")
    base, remainder = divmod(total, len(participants))
    return {
        person: base + (1 if i < remainder else 0)
        for i, person in enumerate(participants)
    }


def validate_unequal(total: int, shares: dict[str, int]) -> dict[str, int]:
    """Check that the shares add up exactly to the total."""
    if not shares:
        raise ValueError("Select at least one participant.")
    difference = total - sum(shares.values())
    if difference != 0:
        direction = "short by" if difference > 0 else "over by"
        raise ValueError(f"Shares are {direction} {format_inr(abs(difference))}.")
    return dict(shares)


# ---------- Balances ----------

def compute_balances(participants: list[str], transactions: list[Transaction]) -> dict[str, dict[str, int]]:
    """Return {person: {'paid', 'share', 'net'}} in paise. net = paid - share."""
    balances = {p: {"paid": 0, "share": 0, "net": 0} for p in participants}
    for tx in transactions:
        balances[tx.payer]["paid"] += tx.total
        for person, share in tx.shares.items():
            balances[person]["share"] += share
    for entry in balances.values():
        entry["net"] = entry["paid"] - entry["share"]
    return balances


def pairwise_debts(transactions: list[Transaction]) -> dict[tuple[str, str], int]:
    """Raw debts implied by the transactions, netted per pair.

    Returns {(debtor, creditor): paise}. This is the 'before' graph.
    """
    owed: dict[tuple[str, str], int] = {}
    for tx in transactions:
        for person, share in tx.shares.items():
            if person != tx.payer and share > 0:
                key = (person, tx.payer)
                owed[key] = owed.get(key, 0) + share

    netted = {}
    for (debtor, creditor), amount in owed.items():
        difference = amount - owed.get((creditor, debtor), 0)
        if difference > 0:
            netted[(debtor, creditor)] = difference
    return netted


# ---------- Debt simplification ----------

def simplify_debts(balances: dict[str, dict[str, int]]) -> list[tuple[str, str, int]]:
    """Greedy settlement: repeatedly match the largest debtor with the largest creditor.

    Returns [(debtor, creditor, paise), ...]. Each step settles at least one
    person completely, so there are at most n - 1 payments. This is not
    guaranteed to be the minimum possible number of payments.
    """
    if sum(b["net"] for b in balances.values()) != 0:
        raise ValueError("Balances do not sum to zero.")

    debtors = [[-b["net"], name] for name, b in balances.items() if b["net"] < 0]
    creditors = [[b["net"], name] for name, b in balances.items() if b["net"] > 0]

    def largest_first(entry):
        return (-entry[0], entry[1])  # biggest amount first, then name for stable ties

    settlements = []
    while debtors and creditors:
        debtors.sort(key=largest_first)
        creditors.sort(key=largest_first)
        debtor, creditor = debtors[0], creditors[0]

        amount = min(debtor[0], creditor[0])
        settlements.append((debtor[1], creditor[1], amount))

        debtor[0] -= amount
        creditor[0] -= amount
        if debtor[0] == 0:
            debtors.pop(0)
        if creditor[0] == 0:
            creditors.pop(0)
    return settlements


# ---------- Export ----------

def build_export(participants, transactions, balances, settlements) -> dict:
    """Build a JSON-serializable dict of the whole session (amounts in paise)."""
    return {
        "currency": "INR",
        "unit": "paise",
        "participants": list(participants),
        "transactions": [
            {
                "description": tx.description,
                "payer": tx.payer,
                "total": tx.total,
                "shares": tx.shares,
            }
            for tx in transactions
        ],
        "balances": balances,
        "settlements": [
            {"from": debtor, "to": creditor, "amount": amount}
            for debtor, creditor, amount in settlements
        ],
    }