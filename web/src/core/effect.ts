/**
 * What one expense means for one member, as shown on the right of each row
 * in the expense list.
 */
import type { Paise } from "./money";
import type { Expense, MemberId } from "./types";

export type Effect =
  /** You paid; others owe you this much of it. */
  | { kind: "lent"; amountPaise: Paise }
  /** Someone else paid; this is your share. */
  | { kind: "borrowed"; amountPaise: Paise }
  /** You paid only for yourself, or your share was zero while you paid nothing. */
  | { kind: "even" }
  /** You neither paid nor had a share. */
  | { kind: "not_involved" };

export function expenseEffect(expense: Expense, me: MemberId): Effect {
  const myShare = expense.shares[me] ?? 0;
  if (expense.payerId === me) {
    const lent = expense.totalPaise - myShare;
    return lent > 0 ? { kind: "lent", amountPaise: lent } : { kind: "even" };
  }
  if (myShare > 0) return { kind: "borrowed", amountPaise: myShare };
  return me in expense.shares ? { kind: "even" } : { kind: "not_involved" };
}
