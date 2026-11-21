import type { Paise } from "./money";

/** A group member's id (a database uuid in the app; any string in tests). */
export type MemberId = string;

/** Each member's share of one expense, in paise. Sums exactly to the expense total. */
export type Shares = Record<MemberId, Paise>;

/** The part of an expense the balance logic needs. */
export interface Expense {
  payerId: MemberId;
  totalPaise: Paise;
  shares: Shares;
}

/** One member's totals. `net = paid - share`: positive gets money back, negative owes. */
export interface Balance {
  paid: Paise;
  share: Paise;
  net: Paise;
}

export type Balances = Record<MemberId, Balance>;

/** "`from` pays `to` `amountPaise`": a raw debt or a proposed settlement. */
export interface Debt {
  from: MemberId;
  to: MemberId;
  amountPaise: Paise;
}
