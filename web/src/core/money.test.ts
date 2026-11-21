import { describe, expect, it } from "vitest";
import { assertPaise, formatInr, parseAmount } from "./money";

describe("parseAmount", () => {
  // test_logic.py: TestMoney.test_parse_valid_amounts
  it("parses valid amounts to paise", () => {
    expect(parseAmount("1200.50")).toBe(120050);
    expect(parseAmount("1,200")).toBe(120000);
    expect(parseAmount("₹5")).toBe(500);
    expect(parseAmount("10.5")).toBe(1050);
    expect(parseAmount(" 0.07 ")).toBe(7);
  });

  it("accepts Indian digit grouping", () => {
    expect(parseAmount("₹12,00,000.25")).toBe(120000025);
  });

  // test_logic.py: TestMoney.test_parse_invalid_amounts
  it.each(["", "abc", "-5", "10.555", "1.2.3", "0", "0.00", "1e3", ".5", "5."])(
    "rejects %j",
    (bad) => {
      expect(() => parseAmount(bad)).toThrow();
    },
  );

  // test_logic.py: TestMoney.test_parse_zero_allowed
  it("allows zero when asked", () => {
    expect(parseAmount("0", { allowZero: true })).toBe(0);
    expect(parseAmount("0.00", { allowZero: true })).toBe(0);
  });

  it("gives user-facing messages", () => {
    expect(() => parseAmount("abc")).toThrow("Invalid amount");
    expect(() => parseAmount("0")).toThrow("Amount must be greater than 0.");
  });

  it("rejects amounts too large to represent exactly", () => {
    expect(() => parseAmount("99999999999999999999")).toThrow("Amount is too large.");
  });
});

describe("formatInr", () => {
  // test_logic.py: TestMoney.test_format_inr
  it("formats paise as rupees", () => {
    expect(formatInr(120050)).toBe("₹1,200.50");
    expect(formatInr(5)).toBe("₹0.05");
    expect(formatInr(0)).toBe("₹0.00");
    expect(formatInr(-150)).toBe("-₹1.50");
  });

  it("uses Indian digit grouping", () => {
    expect(formatInr(120000000)).toBe("₹12,00,000.00");
    expect(formatInr(-1234567890)).toBe("-₹1,23,45,678.90");
  });

  it("round-trips with parseAmount", () => {
    for (const paise of [1, 99, 100, 120050, 120000025]) {
      expect(parseAmount(formatInr(paise))).toBe(paise);
    }
  });

  it("rejects non-integer paise", () => {
    expect(() => formatInr(10.5)).toThrow();
  });
});

describe("assertPaise", () => {
  it("accepts safe integers and rejects everything else", () => {
    expect(() => assertPaise(0)).not.toThrow();
    expect(() => assertPaise(-500)).not.toThrow();
    for (const bad of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assertPaise(bad)).toThrow();
    }
  });
});
