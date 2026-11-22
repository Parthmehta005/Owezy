import { describe, expect, it } from "vitest";
import { computeBalances } from "./balances";
import { expenseEffect } from "./effect";
import type { Expense } from "./types";

const dinner: Expense = { payerId: "A", totalPaise: 90000, shares: { A: 30000, B: 30000, C: 30000 } };

describe("expenseEffect", () => {
  it("payer who shares: lent = total minus own share", () => {
    expect(expenseEffect(dinner, "A")).toEqual({ kind: "lent", amountPaise: 60000 });
  });

  it("payer who doesn't share: lent the whole total", () => {
    expect(expenseEffect({ payerId: "A", totalPaise: 1000, shares: { B: 1000 } }, "A")).toEqual({ kind: "lent", amountPaise: 1000 });
  });

  it("someone else paid: borrowed your share", () => {
    expect(expenseEffect(dinner, "B")).toEqual({ kind: "borrowed", amountPaise: 30000 });
  });

  it("paid only for yourself: even", () => {
    expect(expenseEffect({ payerId: "A", totalPaise: 500, shares: { A: 500 } }, "A")).toEqual({ kind: "even" });
  });

  it("listed with a zero share: even; not listed at all: not involved", () => {
    const gift: Expense = { payerId: "A", totalPaise: 1000, shares: { B: 1000, C: 0 } };
    expect(expenseEffect(gift, "C")).toEqual({ kind: "even" });
    expect(expenseEffect(dinner, "D")).toEqual({ kind: "not_involved" });
  });

  it("adds up to each member's net balance", () => {
    const expenses: Expense[] = [
      dinner,
      { payerId: "B", totalPaise: 4500, shares: { A: 1000, C: 3500 } },
      { payerId: "C", totalPaise: 777, shares: { C: 777 } },
    ];
    const balances = computeBalances(["A", "B", "C", "D"], expenses);
    for (const id of ["A", "B", "C", "D"]) {
      const sum = expenses.reduce((total, e) => {
        const effect = expenseEffect(e, id);
        if (effect.kind === "lent") return total + effect.amountPaise;
        if (effect.kind === "borrowed") return total - effect.amountPaise;
        return total;
      }, 0);
      expect(sum).toBe(balances[id].net);
    }
  });
});
