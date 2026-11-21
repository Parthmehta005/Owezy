import { describe, expect, it } from "vitest";
import { splitEqual, validateUnequal } from "./splits";

const sum = (shares: Record<string, number>) => Object.values(shares).reduce((a, b) => a + b, 0);

describe("splitEqual", () => {
  // test_logic.py: TestSplits.test_equal_even
  it("splits evenly", () => {
    expect(splitEqual(900, ["A", "B", "C"])).toEqual({ A: 300, B: 300, C: 300 });
  });

  // test_logic.py: TestSplits.test_equal_with_remainder_sums_exactly
  it("gives leftover paise to the first members so shares sum exactly", () => {
    const shares = splitEqual(10000, ["A", "B", "C"]); // ₹100 / 3
    expect(sum(shares)).toBe(10000);
    expect(shares).toEqual({ A: 3334, B: 3333, C: 3333 });
  });

  // test_logic.py: TestSplits.test_equal_remainder_larger_than_one
  it("spreads a remainder larger than 1", () => {
    expect(splitEqual(5, ["A", "B", "C"])).toEqual({ A: 2, B: 2, C: 1 });
  });

  it("follows the given member order, not alphabetical order", () => {
    expect(splitEqual(5, ["C", "A", "B"])).toEqual({ C: 2, A: 2, B: 1 });
  });

  // test_logic.py: TestSplits.test_equal_no_participants
  it("requires at least one member", () => {
    expect(() => splitEqual(100, [])).toThrow("Select at least one participant.");
  });

  it("rejects a member listed twice", () => {
    expect(() => splitEqual(100, ["A", "A"])).toThrow();
  });

  it("rejects a non-integer total", () => {
    expect(() => splitEqual(10.5, ["A"])).toThrow();
  });
});

describe("validateUnequal", () => {
  // test_logic.py: TestSplits.test_unequal_valid
  it("accepts shares that sum to the total, including zero shares", () => {
    const shares = { A: 700, B: 300, C: 0 };
    expect(validateUnequal(1000, shares)).toEqual(shares);
    expect(validateUnequal(1000, shares)).not.toBe(shares);
  });

  // test_logic.py: TestSplits.test_unequal_short_and_over
  it("rejects shares that are short or over, saying by how much", () => {
    expect(() => validateUnequal(1000, { A: 400, B: 500 })).toThrow("Shares are short by ₹1.00.");
    expect(() => validateUnequal(1000, { A: 600, B: 500 })).toThrow("Shares are over by ₹1.00.");
  });

  it("requires at least one member", () => {
    expect(() => validateUnequal(1000, {})).toThrow("Select at least one participant.");
  });

  it("rejects negative or fractional shares even if they sum correctly", () => {
    expect(() => validateUnequal(1000, { A: 1500, B: -500 })).toThrow("Shares cannot be negative.");
    expect(() => validateUnequal(1000, { A: 500.5, B: 499.5 })).toThrow();
  });
});
