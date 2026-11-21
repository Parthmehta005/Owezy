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
