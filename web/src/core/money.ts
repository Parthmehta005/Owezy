/**
 * Money helpers. All amounts are integer paise (1 rupee = 100 paise), INR only.
 * Port of parse_amount / format_inr from logic.py. Pure: no I/O, no framework code.
 */

/** An amount in integer paise. */
export type Paise = number;

const AMOUNT_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

// Indian digit grouping (12,00,000). Integer rupees only, so no float rounding.
const RUPEES_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Throws unless `value` is a whole number of paise that JS can represent exactly. */
export function assertPaise(value: number, label = "Amount"): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a whole number of paise.`);
  }
}

/**
 * Convert text like "1,200.50" or "₹5" to paise.
 * Commas and the ₹ sign are ignored; at most 2 decimals are allowed.
 * Throws an Error with a user-facing message if the text is invalid.
 */
export function parseAmount(text: string, { allowZero = false } = {}): Paise {
  let raw = text.trim().replaceAll("₹", "").replaceAll(" ", "");
  // Some Android keyboards type "," as the decimal point. A comma followed
  // by just 1-2 digits at the end can't be digit grouping (both Indian
  // "1,20,000" and western "1,200" end in groups of 3), so it's a decimal:
  // "10,50" is ₹10.50, never ₹1,050.
  if (!raw.includes(".")) raw = raw.replace(/,(\d{1,2})$/, ".$1");
  const cleaned = raw.replaceAll(",", "");
  const match = AMOUNT_PATTERN.exec(cleaned);
  if (!match) {
    throw new Error("Invalid amount. Use a positive number with at most 2 decimals, e.g. 1200.50");
  }
  const [, rupees, fraction = ""] = match;
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) {
    throw new Error("Amount is too large.");
  }
  if (paise === 0 && !allowZero) {
    throw new Error("Amount must be greater than 0.");
  }
  return paise;
}

/** Format paise as "₹12,00,000.50"; negative values get a leading "-" ("-₹1.50"). */
export function formatInr(paise: Paise): string {
  assertPaise(paise);
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign = paise < 0 ? "-" : "";
  return `${sign}₹${RUPEES_FORMAT.format(rupees)}.${String(rest).padStart(2, "0")}`;
}

/**
 * Format paise for the screen: like formatInr, but whole rupees drop the
 * ".00" ("₹900", "₹1,20,000"), while paise still show ("₹10.50", "₹0.05").
 */
export function formatRupees(paise: Paise): string {
  const full = formatInr(paise);
  return full.endsWith(".00") ? full.slice(0, -3) : full;
}

/** Paise as text for an amount field: "900", "10.50" (no ₹, no grouping), so it reads back with parseAmount. */
export function toAmountInput(paise: Paise): string {
  assertPaise(paise);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}
