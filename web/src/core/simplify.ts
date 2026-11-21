/**
 * Greedy debt simplification. Port of simplify_debts from logic.py.
 */
import type { Balances, Debt, MemberId } from "./types";

interface Open {
  id: MemberId;
  order: number; // position in memberIds, for deterministic ties
  amount: number; // paise still owed / still to receive (always > 0)
}

/** Biggest amount first; ties go to the member who comes first in member order. */
function largestFirst(a: Open, b: Open): number {
  return b.amount - a.amount || a.order - b.order;
}

/**
 * Propose payments that settle every balance: repeatedly match the member who
 * owes the most with the member owed the most and pay the smaller of the two
 * amounts. Each step settles at least one member, so there are at most n - 1
 * payments. This is not guaranteed to be the minimum number of payments
 * (that problem is NP-hard); see the README's trade-offs section.
 *
 * `memberIds` gives the member order used to break ties and must list exactly
 * the members in `balances`.
 */
export function simplifyDebts(memberIds: readonly MemberId[], balances: Readonly<Balances>): Debt[] {
  if (memberIds.length !== Object.keys(balances).length || memberIds.some((id) => !(id in balances))) {
    throw new Error("Member list and balances do not match.");
  }

  const debtors: Open[] = [];
  const creditors: Open[] = [];
  let total = 0;
  memberIds.forEach((id, order) => {
    const net = balances[id].net;
    if (!Number.isSafeInteger(net)) throw new Error("Balances must be whole paise.");
    total += net;
    if (net < 0) debtors.push({ id, order, amount: -net });
    if (net > 0) creditors.push({ id, order, amount: net });
  });
  if (total !== 0) {
    throw new Error("Balances do not sum to zero.");
  }

  const settlements: Debt[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(largestFirst);
    creditors.sort(largestFirst);
    const debtor = debtors[0];
    const creditor = creditors[0];

    const amount = Math.min(debtor.amount, creditor.amount);
    settlements.push({ from: debtor.id, to: creditor.id, amountPaise: amount });

    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
  }
  return settlements;
}
