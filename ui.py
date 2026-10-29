"""All terminal interaction: questionary prompts and rich tables."""

import questionary
from rich.console import Console
from rich.markup import escape
from rich.table import Table

import logic
from logic import Transaction

console = Console()

UNEQUAL_OPTION = "Split unequally (instead of equally)"

# ---------- Helpers ----------

def _ask(question):
    """Run a questionary prompt; turn Ctrl+C (None) into KeyboardInterrupt."""
    answer = question.ask()
    if answer is None:
        raise KeyboardInterrupt
    return answer


def _amount_validator(allow_zero=False):
    """Build a questionary validator that reuses logic.parse_amount."""
    def check(text):
        try:
            logic.parse_amount(text, allow_zero=allow_zero)
        except ValueError as e:
            return str(e)
        return True
    return check


def _ask_amount(prompt, allow_zero=False):
    text = _ask(questionary.text(prompt, validate=_amount_validator(allow_zero)))
    return logic.parse_amount(text, allow_zero=allow_zero)


def show_message(text):
    console.print(escape(text))


# ---------- Prompts ----------

def ask_participants():
    """Ask for space-separated names (at least 2, no duplicates)."""
    def check(text):
        try:
            logic.validate_names(text.split())
        except ValueError as e:
            return str(e)
        return True

    text = _ask(questionary.text("Enter the names of users involved:", validate=check))
    return logic.validate_names(text.split())


def ask_transaction(participants):
    """Ask for one transaction and return it as a Transaction."""
    description = _ask(questionary.text(
        "Transaction description:",
        validate=lambda t: True if t.strip() else "Description cannot be empty.",
    )).strip()

    payer = _ask(questionary.select("Who paid?", choices=participants))
    total = _ask_amount("Total amount (₹):")

    chosen = _ask(questionary.checkbox(
        "Who shared this expense? (space to toggle, enter to confirm)",
        choices=participants + [questionary.Separator(), UNEQUAL_OPTION],
        validate=lambda picked: (
            True if any(p != UNEQUAL_OPTION for p in picked)
            else "Select at least one person."
        ),
    ))
    unequal = UNEQUAL_OPTION in chosen
    # Keep the original participant order so results are predictable.
    involved = [p for p in participants if p in chosen]

    if unequal:
        shares = _ask_unequal_shares(total, involved)
    else:
        shares = logic.split_equal(total, involved)

    if involved == [payer]:
        show_message("Note: the payer is the only participant, so no balances change.")
    return Transaction(description, payer, total, shares)


def _ask_unequal_shares(total, involved):
    """Ask each person's share until they add up exactly to the total."""
    while True:
        shares = {}
        for person in involved:
            remaining = total - sum(shares.values())
            shares[person] = _ask_amount(
                f"Share of {person} (remaining {logic.format_inr(remaining)}):",
                allow_zero=True,
            )
        try:
            return logic.validate_unequal(total, shares)
        except ValueError as e:
            show_message(f"{e} Please enter the shares again.")


def ask_next_action(can_delete):
    """Return 'add', 'delete' or 'finish'."""
    choices = [questionary.Choice("Add another transaction", value="add")]
    if can_delete:
        choices.append(questionary.Choice("Delete previous transaction", value="delete"))
    choices.append(questionary.Choice("Finish", value="finish"))
    return _ask(questionary.select("What next?", choices=choices))


def ask_yes_no(prompt):
    return _ask(questionary.confirm(prompt, default=True))


# ---------- Output ----------

def show_transactions(transactions):
    """Table of every transaction with payer, total and each person's share."""
    table = Table(title="Transactions", show_lines=True)
    table.add_column("#", justify="right")
    table.add_column("Description")
    table.add_column("Paid by")
    table.add_column("Total", justify="right")
    table.add_column("Shares")
    for i, tx in enumerate(transactions, start=1):
        shares = "\n".join(
            f"{escape(person)}: {logic.format_inr(share)}"
            for person, share in tx.shares.items()
        )
        table.add_row(str(i), escape(tx.description), escape(tx.payer),
                      logic.format_inr(tx.total), shares)
    console.print(table)


def show_balances(balances):
    """Table of paid, share and net balance per person."""
    table = Table(title="Balances")
    table.add_column("Person")
    table.add_column("Paid", justify="right")
    table.add_column("Share", justify="right")
    table.add_column("Net balance", justify="right")
    for person, b in balances.items():
        color = "green" if b["net"] > 0 else "red" if b["net"] < 0 else "white"
        table.add_row(
            escape(person),
            logic.format_inr(b["paid"]),
            logic.format_inr(b["share"]),
            f"[{color}]{logic.format_inr(b['net'])}[/{color}]",
        )
    console.print(table)
    console.print("[dim]Positive = gets money back, negative = owes money.[/dim]")


def _payments_table(title, payments):
    table = Table(title=title)
    table.add_column("Payment")
    for debtor, creditor, amount in payments:
        table.add_row(f"{escape(debtor)} pays {escape(creditor)} {logic.format_inr(amount)}")
    return table


def show_settlements(before, after):
    """Show raw pairwise debts, the simplified payments, and the reduction."""
    before_list = [(d, c, amt) for (d, c), amt in before.items()]

    if before_list:
        console.print(_payments_table("Before simplification", before_list))
    if after:
        console.print(_payments_table("Simplified settlements", after))
    else:
        console.print("[green]Everyone is already settled. No payments needed.[/green]")
    console.print(f"Payments needed: {len(before_list)} -> {len(after)}")