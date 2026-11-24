import { describe, expect, it } from "vitest";
import { decayedScore, rankByFrecency, recordOpen } from "./frecency";

const NOW = new Date("2026-11-24T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

/** Open a group at each of these times (oldest first) and return its stored score. */
function opens(...times: Date[]) {
  let state = { score: 0, openedAt: null as Date | null };
  for (const t of times) state = recordOpen(state.score, state.openedAt, t);
  return state;
}

describe("decayedScore", () => {
  it("halves every 7 days", () => {
    expect(decayedScore(8, daysAgo(7), NOW)).toBeCloseTo(4);
    expect(decayedScore(8, daysAgo(14), NOW)).toBeCloseTo(2);
    expect(decayedScore(8, NOW, NOW)).toBe(8);
  });

  it("is zero for a group never opened", () => {
    expect(decayedScore(0, null, NOW)).toBe(0);
  });
});

describe("recordOpen", () => {
  it("adds one per open", () => {
    expect(opens(daysAgo(2), daysAgo(1), NOW).score).toBeCloseTo(0.5 ** (2 / 7) + 0.5 ** (1 / 7) + 1);
  });

  it("doesn't count re-opens within 30 minutes", () => {
    expect(opens(minutesAgo(20), minutesAgo(10), NOW).score).toBeCloseTo(1, 2);
    expect(opens(minutesAgo(31), NOW).score).toBeCloseTo(2, 2);
  });
});

describe("rankByFrecency", () => {
  const group = (name: string, state: { score: number; openedAt: Date | null }) => ({ name, ...state });

  it("puts the group you open most often first", () => {
    const daily = group("Flatmates", opens(daysAgo(3), daysAgo(2), daysAgo(1)));
    const once = group("Goa trip", opens(minutesAgo(40)));
    expect(rankByFrecency([once, daily], NOW).map((g) => g.name)).toEqual(["Flatmates", "Goa trip"]);
  });

  it("lets a heavily used but old group fade behind today's routine", () => {
    const oldTrip = group("Old trip", opens(...Array.from({ length: 10 }, (_, i) => daysAgo(60 - i))));
    const now = group("Flatmates", opens(daysAgo(2), daysAgo(1), NOW));
    expect(rankByFrecency([oldTrip, now], NOW)[0].name).toBe("Flatmates");
  });

  it("breaks ties by most recent open, and lists never-opened groups last by name", () => {
    const a = group("A", { score: 1, openedAt: daysAgo(1) });
    const b = group("B", { score: 1, openedAt: daysAgo(1) });
    const zebra = group("Zebra", { score: 0, openedAt: null });
    const apple = group("Apple", { score: 0, openedAt: null });
    const recent = group("Recent", { score: 0.5 ** (1 / 7), openedAt: NOW }); // same value as A and B, but newer
    expect(rankByFrecency([zebra, b, apple, a, recent], NOW).map((g) => g.name)).toEqual(["Recent", "A", "B", "Apple", "Zebra"]);
  });
});
