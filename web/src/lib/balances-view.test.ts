import { describe, expect, it } from "vitest";
import { computeBalances, pairwiseDebts } from "@/core/balances";
import type { BundleExpense, GroupBundle } from "@/lib/data/bundle";
import { debtLines, groupBalances, mySummary, rawDebts } from "./balances-view";

/**
 * Fixture group (amounts in paise), worked out by hand:
 *   1. Asha paid ₹3,000 for Asha, Rahul, Neha equally  -> Rahul owes Asha ₹1,000, Neha owes Asha ₹1,000
 *   2. Neha paid ₹1,50,000: Neha ₹30,000, Bilal ₹1,20,000 -> Bilal owes Neha ₹1,20,000
 *   3. Rahul paid ₹600 for Rahul, Bilal equally         -> Bilal owes Rahul ₹300
 * Nets: Asha +₹2,000, Rahul -₹700, Neha +₹1,19,000, Bilal -₹1,20,300 (sum 0).
 */
const ids = ["asha", "rahul", "neha", "bilal"] as const;

function expense(id: string, payerId: string, totalPaise: number, shares: Record<string, number>): BundleExpense {
  return { id, description: id, payerId, totalPaise, splitType: "unequal", date: "2026-11-20", createdAt: "", version: 1, shares };
}

function fixture(me: string | null): GroupBundle {
  return {
    group: { id: "g", name: "Goa trip" },
    members: ids.map((id) => ({ id, displayName: id[0].toUpperCase() + id.slice(1), isPlaceholder: false, isMe: id === me })),
    meId: me,
    expenses: [
      expense("rahul-600", "rahul", 60000, { rahul: 30000, bilal: 30000 }),
      expense("neha-150000", "neha", 15000000, { neha: 3000000, bilal: 12000000 }),
      expense("asha-3000", "asha", 300000, { asha: 100000, rahul: 100000, neha: 100000 }),
    ],
  };
}

describe("groupBalances", () => {
  it("matches core computeBalances in member order", () => {
    const bundle = fixture("asha");
    expect(groupBalances(bundle)).toEqual(computeBalances([...ids], bundle.expenses));
  });

  it("gives the hand-worked nets, summing to zero", () => {
    const nets = Object.fromEntries(Object.entries(groupBalances(fixture("asha"))).map(([id, b]) => [id, b.net]));
    expect(nets).toEqual({ asha: 200000, rahul: -70000, neha: 11900000, bilal: -12030000 });
  });
});

describe("mySummary", () => {
  const summaryFor = (me: string | null, bundle = fixture(me)) => mySummary(bundle, groupBalances(bundle));

  it("says what you get back, or what you owe", () => {
    expect(summaryFor("asha")).toEqual({ kind: "gets_back", amountPaise: 200000 });
    expect(summaryFor("bilal")).toEqual({ kind: "owes", amountPaise: 12030000 });
  });

  it("is settled when your net is zero, including with no expenses", () => {
    expect(summaryFor("asha", { ...fixture("asha"), expenses: [] })).toEqual({ kind: "settled" });
    const evenBundle = { ...fixture("asha"), expenses: [expense("solo", "asha", 5000, { asha: 5000 })] };
    expect(summaryFor("asha", evenBundle)).toEqual({ kind: "settled" });
  });

  it("is null for someone who isn't a member", () => {
    expect(summaryFor(null)).toBeNull();
  });
});

describe("raw debts", () => {
  it("are exactly core pairwiseDebts", () => {
    const bundle = fixture("asha");
    expect(rawDebts(bundle)).toEqual(pairwiseDebts(bundle.expenses));
  });

  it("read from Asha's side: hers first, then biggest first", () => {
    const bundle = fixture("asha");
    expect(debtLines(bundle, rawDebts(bundle)).map((l) => [l.text, l.amountPaise, l.tone])).toEqual([
      ["Rahul owes you", 100000, "positive"],
      ["Neha owes you", 100000, "positive"],
      ["Bilal owes Neha", 12000000, "neutral"],
      ["Bilal owes Rahul", 30000, "neutral"],
    ]);
  });

  it("read from Bilal's side", () => {
    const bundle = fixture("bilal");
    expect(debtLines(bundle, rawDebts(bundle)).map((l) => [l.text, l.tone])).toEqual([
      ["You owe Neha", "negative"],
      ["You owe Rahul", "negative"],
      ["Rahul owes Asha", "neutral"],
      ["Neha owes Asha", "neutral"],
    ]);
  });

  it("net out opposite debts between the same two people", () => {
    const bundle = {
      ...fixture("asha"),
      expenses: [
        expense("a", "asha", 1000, { asha: 500, rahul: 500 }),
        expense("b", "rahul", 600, { asha: 300, rahul: 300 }),
      ],
    };
    expect(debtLines(bundle, rawDebts(bundle)).map((l) => [l.text, l.amountPaise])).toEqual([["Rahul owes you", 200]]);
  });
});
