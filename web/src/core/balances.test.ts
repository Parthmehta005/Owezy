import { describe, expect, it } from "vitest";
import { computeBalances, pairwiseDebts } from "./balances";
import { addNames } from "./names";
import { splitEqual } from "./splits";
import type { Balances, Expense } from "./types";

const netSum = (balances: Balances) => Object.values(balances).reduce((sum, b) => sum + b.net, 0);

describe("computeBalances", () => {
  // test_logic.py: TestBalances.test_payer_shares_own_expense
  it("credits the payer and debits each sharer, payer included", () => {
    const expense: Expense = { payerId: "A", totalPaise: 30000, shares: { A: 10000, B: 10000, C: 10000 } };
    const balances = computeBalances(["A", "B", "C"], [expense]);
    expect(balances.A).toEqual({ paid: 30000, share: 10000, net: 20000 });
    expect(balances.B.net).toBe(-10000);
    expect(balances.C.net).toBe(-10000);
  });

  // test_logic.py: TestBalances.test_payer_not_a_participant
  it("handles a payer who is not sharing the expense", () => {
    const expense: Expense = { payerId: "A", totalPaise: 20000, shares: { B: 10000, C: 10000 } };
    const balances = computeBalances(["A", "B", "C"], [expense]);
    expect(balances.A).toEqual({ paid: 20000, share: 0, net: 20000 });
  });

  // test_logic.py: TestBalances.test_payer_only_participant_changes_nothing
  it("leaves nets at zero when the payer is the only sharer", () => {
    const expense: Expense = { payerId: "A", totalPaise: 5000, shares: { A: 5000 } };
    const balances = computeBalances(["A", "B"], [expense]);
    expect(balances.A.net).toBe(0);
    expect(balances.B.net).toBe(0);
  });

  // test_logic.py: TestBalances.test_balances_sum_to_zero
  it("produces nets that sum to zero", () => {
    const expenses: Expense[] = [
      { payerId: "A", totalPaise: 10000, shares: splitEqual(10000, ["A", "B", "C"]) },
      { payerId: "B", totalPaise: 4500, shares: { A: 1000, C: 3500 } },
    ];
    expect(netSum(computeBalances(["A", "B", "C"], expenses))).toBe(0);
  });

  // test_logic.py: TestNames.test_person_added_later_has_zero_balance_until_used
  it("gives a member added later zero balances until they are used", () => {
    const expense: Expense = { payerId: "Parth", totalPaise: 1000, shares: { Parth: 500, Rahul: 500 } };
    const members = addNames(["Parth", "Rahul"], ["Aditi"]);
    const balances = computeBalances(members, [expense]);
    expect(balances.Aditi).toEqual({ paid: 0, share: 0, net: 0 });
    expect(netSum(balances)).toBe(0);
  });

  it("returns zeros for every member when there are no expenses", () => {
    expect(computeBalances(["A", "B"], [])).toEqual({
      A: { paid: 0, share: 0, net: 0 },
      B: { paid: 0, share: 0, net: 0 },
    });
  });

  it("rejects an expense that names an unknown member", () => {
    expect(() => computeBalances(["A"], [{ payerId: "Z", totalPaise: 100, shares: { A: 100 } }])).toThrow(
      "Unknown member: Z",
    );
    expect(() => computeBalances(["A"], [{ payerId: "A", totalPaise: 100, shares: { Z: 100 } }])).toThrow(
      "Unknown member: Z",
    );
  });

  it("rejects an expense whose shares do not add up to its total", () => {
    expect(() => computeBalances(["A", "B"], [{ payerId: "A", totalPaise: 100, shares: { B: 90 } }])).toThrow(
      "do not add up",
    );
  });
});

describe("pairwiseDebts", () => {
  // test_logic.py: TestPairwiseDebts.test_opposite_debts_are_netted
  it("nets opposite debts between the same two members", () => {
    const expenses: Expense[] = [
      { payerId: "A", totalPaise: 30000, shares: { A: 10000, B: 10000, C: 10000 } },
      { payerId: "B", totalPaise: 10000, shares: { A: 5000, B: 5000 } },
    ];
    // B owes A 100, A owes B 50 -> B owes A 50. C owes A 100.
    expect(pairwiseDebts(expenses)).toEqual([
      { from: "B", to: "A", amountPaise: 5000 },
      { from: "C", to: "A", amountPaise: 10000 },
    ]);
  });

  // test_logic.py: TestPairwiseDebts.test_exactly_cancelling_debts_disappear
  it("drops debts that cancel out exactly", () => {
    const expenses: Expense[] = [
      { payerId: "A", totalPaise: 10000, shares: { B: 10000 } },
      { payerId: "B", totalPaise: 10000, shares: { A: 10000 } },
    ];
    expect(pairwiseDebts(expenses)).toEqual([]);
  });

  it("adds up repeated debts in the same direction", () => {
    const expenses: Expense[] = [
      { payerId: "A", totalPaise: 1000, shares: { B: 1000 } },
      { payerId: "A", totalPaise: 500, shares: { A: 250, B: 250 } },
    ];
    expect(pairwiseDebts(expenses)).toEqual([{ from: "B", to: "A", amountPaise: 1250 }]);
  });

  it("ignores the payer's own share and zero shares", () => {
    const expenses: Expense[] = [{ payerId: "A", totalPaise: 1000, shares: { A: 1000, B: 0 } }];
    expect(pairwiseDebts(expenses)).toEqual([]);
  });

  it("does not modify the input expenses", () => {
    const expenses: Expense[] = [{ payerId: "A", totalPaise: 1000, shares: { B: 1000 } }];
    const copy = structuredClone(expenses);
    pairwiseDebts(expenses);
    expect(expenses).toEqual(copy);
  });
});
