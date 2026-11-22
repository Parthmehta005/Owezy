/**
 * Splitting an expense between members. Port of split_equal / validate_unequal from logic.py.
 */
import { assertPaise, formatInr, type Paise } from "./money";
import type { MemberId, Shares } from "./types";

/**
 * Split `totalPaise` evenly between `memberIds`. Leftover paise go one each
 * to the first members in the given order, so the shares sum exactly to the total.
 */
export function splitEqual(totalPaise: Paise, memberIds: readonly MemberId[]): Shares {
  assertPaise(totalPaise, "Total");
  if (memberIds.length === 0) {
    throw new Error("Select at least one participant.");
  }
  if (new Set(memberIds).size !== memberIds.length) {
    throw new Error("Each participant can be selected only once.");
  }
  const base = Math.floor(totalPaise / memberIds.length);
  const remainder = totalPaise % memberIds.length;
  const shares: Shares = {};
  memberIds.forEach((id, i) => {
    shares[id] = base + (i < remainder ? 1 : 0);
  });
  return shares;
}

/** Check unequal shares: whole, non-negative paise that add up exactly to the total. Returns a copy. */
export function validateUnequal(totalPaise: Paise, shares: Readonly<Shares>): Shares {
  assertPaise(totalPaise, "Total");
  const entries = Object.entries(shares);
  if (entries.length === 0) {
    throw new Error("Select at least one participant.");
  }
  for (const [, share] of entries) {
    assertPaise(share, "Each share");
    if (share < 0) throw new Error("Shares cannot be negative.");
  }
  const difference = totalPaise - entries.reduce((sum, [, share]) => sum + share, 0);
  if (difference !== 0) {
    const direction = difference > 0 ? "short by" : "over by";
    throw new Error(`Shares are ${direction} ${formatInr(Math.abs(difference))}.`);
  }
  return { ...shares };
}

export interface SplitResult {
  /** Ready to save, or null if the split isn't complete or valid yet. */
  shares: Shares | null;
  /** Unequal mode: total minus what's been assigned (negative = over). Null if there's no total yet. */
  remainingPaise: Paise | null;
  /** Something the person must fix, in their words. */
  problem: string | null;
}

/**
 * The split being built in the expense sheet.
 * - equal: `memberIds` are the people included, in member order.
 * - unequal: `amounts` per member in paise; null means the text couldn't be
 *   read as an amount. Members with 0 are left out of the shares.
 */
export function buildShares(
  input:
    | { mode: "equal"; totalPaise: Paise | null; memberIds: readonly MemberId[] }
    | { mode: "unequal"; totalPaise: Paise | null; amounts: Readonly<Record<MemberId, Paise | null>> },
): SplitResult {
  if (input.mode === "equal") {
    if (input.memberIds.length === 0) return { shares: null, remainingPaise: null, problem: "Select at least one person." };
    if (!input.totalPaise) return { shares: null, remainingPaise: null, problem: null };
    return { shares: splitEqual(input.totalPaise, input.memberIds), remainingPaise: 0, problem: null };
  }

  const entries = Object.entries(input.amounts);
  if (entries.some(([, v]) => v === null)) {
    return { shares: null, remainingPaise: null, problem: "One of the amounts isn't a number." };
  }
  const assigned = entries.reduce((sum, [, v]) => sum + (v ?? 0), 0);
  if (!input.totalPaise) return { shares: null, remainingPaise: null, problem: null };
  const remaining = input.totalPaise - assigned;
  if (remaining !== 0) return { shares: null, remainingPaise: remaining, problem: null };
  const shares: Shares = {};
  for (const [id, v] of entries) if (v) shares[id] = v;
  return { shares: validateUnequal(input.totalPaise, shares), remainingPaise: 0, problem: null };
}
