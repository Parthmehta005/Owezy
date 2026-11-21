import { describe, expect, it } from "vitest";
import { computeBalances, pairwiseDebts } from "./balances";
import { simplifyDebts } from "./simplify";
import { splitEqual } from "./splits";
import type { Balances, Debt, Expense, Shares } from "./types";

/** Balances from { id: net } in that member order. */
function fromNets(nets: Record<string, number>): [string[], Balances] {
  const balances: Balances = {};
  for (const [id, net] of Object.entries(nets)) balances[id] = { paid: 0, share: 0, net };
  return [Object.keys(nets), balances];
}

/** Nets after every payment is made. */
function applyPayments(balances: Balances, payments: Debt[]): Record<string, number> {
  const nets = Object.fromEntries(Object.entries(balances).map(([id, b]) => [id, b.net]));
  for (const { from, to, amountPaise } of payments) {
    nets[from] += amountPaise;
    nets[to] -= amountPaise;
  }
  return nets;
}

/** test_logic.py: TestSimplifyDebts.check_settles */
function checkSettles(nets: Record<string, number>): Debt[] {
  const [ids, balances] = fromNets(nets);
  const settlements = simplifyDebts(ids, balances);
  expect(Object.values(applyPayments(balances, settlements)).every((v) => v === 0)).toBe(true);
  expect(settlements.length).toBeLessThanOrEqual(Math.max(ids.length - 1, 0));
  for (const { from, to, amountPaise } of settlements) {
    expect(amountPaise).toBeGreaterThan(0);
    expect(from).not.toBe(to);
  }
  return settlements;
}

describe("simplifyDebts", () => {
  // test_logic.py: TestSimplifyDebts.test_already_settled
  it("proposes nothing when everyone is settled", () => {
    expect(simplifyDebts(...fromNets({ A: 0, B: 0 }))).toEqual([]);
  });

  // test_logic.py: TestSimplifyDebts.test_simple_one_to_one
  it("settles one debtor and one creditor in one payment", () => {
    expect(checkSettles({ A: 30000, B: -30000 })).toEqual([{ from: "B", to: "A", amountPaise: 30000 }]);
  });

  // test_logic.py: TestSimplifyDebts.test_chain_collapses_to_one_payment
  it("collapses a chain into one direct payment", () => {
    // A owes B, B owes C (B nets to zero) -> A pays C directly.
    expect(checkSettles({ A: -10000, B: 0, C: 10000 })).toEqual([{ from: "A", to: "C", amountPaise: 10000 }]);
  });

  // test_logic.py: TestSimplifyDebts.test_multiple_debtors_and_creditors (exact list from logic.py)
  it("matches the Python greedy result for several debtors and creditors", () => {
    expect(checkSettles({ A: -50000, B: -30000, C: 60000, D: 20000 })).toEqual([
      { from: "A", to: "C", amountPaise: 50000 },
      { from: "B", to: "D", amountPaise: 20000 },
      { from: "B", to: "C", amountPaise: 10000 },
    ]);
  });

  // test_logic.py: TestSimplifyDebts.test_one_creditor_many_debtors
  it("settles one creditor with many debtors", () => {
    expect(checkSettles({ A: 30000, B: -10000, C: -10000, D: -10000 })).toHaveLength(3);
  });

  // test_logic.py: TestSimplifyDebts.test_with_rounding_paise
  it("settles exactly when an equal split has leftover paise", () => {
    const expense: Expense = { payerId: "A", totalPaise: 10000, shares: splitEqual(10000, ["A", "B", "C"]) };
    const balances = computeBalances(["A", "B", "C"], [expense]);
    const settlements = simplifyDebts(["A", "B", "C"], balances);
    expect(Object.values(applyPayments(balances, settlements)).every((v) => v === 0)).toBe(true);
  });

  // test_logic.py: TestSimplifyDebts.test_unbalanced_input_raises
  it("rejects balances that do not sum to zero", () => {
    expect(() => simplifyDebts(...fromNets({ A: 100, B: -50 }))).toThrow("Balances do not sum to zero.");
  });

  it("pins the README's greedy-is-not-optimal example (4 payments; 3 are possible)", () => {
    expect(checkSettles({ A: 600, B: -300, C: -300, D: -500, E: 500 })).toEqual([
      { from: "D", to: "A", amountPaise: 500 },
      { from: "B", to: "E", amountPaise: 300 },
      { from: "C", to: "E", amountPaise: 200 },
      { from: "C", to: "A", amountPaise: 100 },
    ]);
  });

  it("breaks ties by member order, not by id or name", () => {
    expect(checkSettles({ Y: -100, X: -100, Z: 200 })).toEqual([
      { from: "Y", to: "Z", amountPaise: 100 },
      { from: "X", to: "Z", amountPaise: 100 },
    ]);
  });

  it("rejects a member list that does not match the balances", () => {
    const [, balances] = fromNets({ A: 100, B: -100 });
    expect(() => simplifyDebts(["A"], balances)).toThrow("do not match");
    expect(() => simplifyDebts(["A", "C"], balances)).toThrow("do not match");
  });

  it("does not modify the input balances", () => {
    const [ids, balances] = fromNets({ A: 100, B: -100 });
    const copy = structuredClone(balances);
    simplifyDebts(ids, balances);
    expect(balances).toEqual(copy);
  });
});

describe("invariants on random groups", () => {
  // Small seeded PRNG (mulberry32) so failures are reproducible.
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("for 500 random groups: nets sum to 0, raw debts and settlements both settle everyone, <= n-1 payments", () => {
    const random = rng(42);
    const int = (max: number) => Math.floor(random() * max);

    for (let round = 0; round < 500; round++) {
      const ids = Array.from({ length: 2 + int(7) }, (_, i) => `m${i}`);
      const expenses: Expense[] = Array.from({ length: int(10) }, () => {
        const totalPaise = 1 + int(500000);
        const sharers = ids.filter(() => random() < 0.6);
        const involved = sharers.length > 0 ? sharers : [ids[int(ids.length)]];
        let shares: Shares;
        if (random() < 0.5) {
          shares = splitEqual(totalPaise, involved);
        } else {
          // Unequal: random cut points, last sharer takes the rest.
          shares = {};
          let left = totalPaise;
          involved.forEach((id, i) => {
            const share = i === involved.length - 1 ? left : int(left + 1);
            shares[id] = share;
            left -= share;
          });
        }
        return { payerId: ids[int(ids.length)], totalPaise, shares };
      });

      const balances = computeBalances(ids, expenses);
      expect(Object.values(balances).reduce((sum, b) => sum + b.net, 0)).toBe(0);

      const settlements = simplifyDebts(ids, balances);
      expect(Object.values(applyPayments(balances, settlements)).every((v) => v === 0)).toBe(true);
      expect(settlements.length).toBeLessThanOrEqual(ids.length - 1);

      const raw = pairwiseDebts(expenses);
      expect(Object.values(applyPayments(balances, raw)).every((v) => v === 0)).toBe(true);
    }
  });
});
