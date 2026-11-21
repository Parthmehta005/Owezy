import type { Paise } from "./money";

/** A group member's id (a database uuid in the app; any string in tests). */
export type MemberId = string;

/** Each member's share of one expense, in paise. Sums exactly to the expense total. */
export type Shares = Record<MemberId, Paise>;
