/**
 * Balances and raw debts. Port of compute_balances / pairwise_debts from logic.py.
 */
import { assertPaise } from "./money";
import type { Balances, Debt, Expense, MemberId } from "./types";

/** Throws unless the expense's amounts are whole paise and its shares sum to its total. */
function assertConsistent(expense: Expense): void {
  assertPaise(expense.totalPaise, "Total");
  let sum = 0;
  for (const share of Object.values(expense.shares)) {
    assertPaise(share, "Each share");
    sum += share;
  }
  if (sum !== expense.totalPaise) {
    throw new Error("An expense's shares do not add up to its total.");
  }
}

/**
 * Each member's paid / share / net totals, in paise, for every member in
 * `memberIds` (members with no expenses get zeros). Nets always sum to 0.
 */
export function computeBalances(memberIds: readonly MemberId[], expenses: readonly Expense[]): Balances {
  const balances: Balances = {};
  for (const id of memberIds) balances[id] = { paid: 0, share: 0, net: 0 };

  const entry = (id: MemberId) => {
    const balance = balances[id];
    if (!balance) throw new Error(`Unknown member: ${id}`);
    return balance;
  };

  for (const expense of expenses) {
    assertConsistent(expense);
    entry(expense.payerId).paid += expense.totalPaise;
    for (const [id, share] of Object.entries(expense.shares)) {
      entry(id).share += share;
    }
  }
  for (const balance of Object.values(balances)) {
    balance.net = balance.paid - balance.share;
  }
  return balances;
}

/**
 * The raw debts the expenses imply (the "before simplification" view): each
 * sharer owes the payer their share, and opposite debts between the same two
 * members are netted. Pairs that cancel out exactly are dropped. Order follows
 * the first time each pair appears.
 */
export function pairwiseDebts(expenses: readonly Expense[]): Debt[] {
  // Keyed "from\0to"; ids never contain \0.
  const owed = new Map<string, Debt>();
  const keyOf = (from: MemberId, to: MemberId) => `${from}\0${to}`;

  for (const expense of expenses) {
    assertConsistent(expense);
    for (const [id, share] of Object.entries(expense.shares)) {
      if (id === expense.payerId || share <= 0) continue;
      const key = keyOf(id, expense.payerId);
      const debt = owed.get(key) ?? { from: id, to: expense.payerId, amountPaise: 0 };
      debt.amountPaise += share;
      owed.set(key, debt);
    }
  }

  const netted: Debt[] = [];
  for (const debt of owed.values()) {
    const opposite = owed.get(keyOf(debt.to, debt.from))?.amountPaise ?? 0;
    const difference = debt.amountPaise - opposite;
    if (difference > 0) netted.push({ ...debt, amountPaise: difference });
  }
  return netted;
}
