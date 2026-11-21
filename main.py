"""Entry point: runs the whole session from participants to JSON export."""

import json
import webbrowser
from pathlib import Path

import logic
import ui
import visualize

EXPORT_FILE = "owezy_export.json"
GRAPH_FILE = "owezy_graphs.html"


def show_summary(participants, transactions):
    """Show every transaction plus each person's paid / share / net balance."""
    ui.show_transactions(transactions)
    # ui.show_balances(logic.compute_balances(participants, transactions))


def collect_transactions(participants):
    """Loop: add a transaction, show the summary, then add / add people / delete / finish.

    New people are appended to `participants` in place, so the caller sees them too.
    """
    transactions = []
    while True:
        transactions.append(ui.ask_transaction(participants))
        show_summary(participants, transactions)
        
        while True:
            action = ui.ask_next_action(can_delete=bool(transactions))
            if action == "delete":
                removed = transactions.pop()
                ui.show_message(f"Deleted: {removed.description}")
                if transactions:
                    show_summary(participants, transactions)
            elif action == "people":
                added = ui.ask_new_participants(participants)
                participants.extend(added)
                ui.show_message(f"Added: {', '.join(added)}. Participants: {', '.join(participants)}")
            elif action == "add":
                break
            else:  # "finish"
                ui.show_balances(logic.compute_balances(participants, transactions))
                return transactions


def export_json(participants, transactions, balances, settlements):
    """Write the session data to a JSON file."""
    data = logic.build_export(participants, transactions, balances, settlements)
    with open(EXPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    ui.show_message(f"Exported to {EXPORT_FILE}")


def show_graphs(participants, before, settlements):
    """Write the before/after graphs to an HTML file and open it in the browser."""
    html = visualize.build_html(participants, before, settlements)
    path = Path(GRAPH_FILE).resolve()
    path.write_text(html, encoding="utf-8")
    webbrowser.open(path.as_uri())
    ui.show_message(f"Graphs saved to {path}")


def run():
    participants = ui.ask_participants()
    transactions = collect_transactions(participants)

    if not transactions:
        ui.show_message("No transactions entered. Nothing to settle.")
        return

    balances = logic.compute_balances(participants, transactions)
    settlements = logic.simplify_debts(balances)
    before = logic.pairwise_debts(transactions)

    if ui.ask_yes_no("Simplify debts?"):
        ui.show_settlements(before, settlements)

    if ui.ask_yes_no("Show before/after graphs in your browser?"):
        show_graphs(participants, before, settlements)

    if ui.ask_yes_no("Export to JSON?"):
        export_json(participants, transactions, balances, settlements)


def main():
    try:
        run()
    except (KeyboardInterrupt, EOFError):
        print("\nExiting.")


if __name__ == "__main__":
    main()