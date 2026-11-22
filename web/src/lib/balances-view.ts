/**
 * What the group screen shows about balances, worked out from the cached
 * group bundle with the `core/` functions (no extra server call). Expenses
 * still being saved count too, so the numbers move the moment you tap Save.
 */
import { computeBalances, pairwiseDebts } from "@/core/balances";
import type { Paise } from "@/core/money";
import type { Balances, Debt } from "@/core/types";
import type { GroupBundle } from "@/lib/data/bundle";

export type MySummary =
  | { kind: "gets_back"; amountPaise: Paise }
  | { kind: "owes"; amountPaise: Paise }
  | { kind: "settled" };

/** Every member's paid / share / net, in member order. */
export function groupBalances(bundle: GroupBundle): Balances {
  return computeBalances(
    bundle.members.map((m) => m.id),
    bundle.expenses,
  );
}

/** "You get back / You owe / All settled" for the signed-in member, or null if they aren't one. */
export function mySummary(bundle: GroupBundle, balances: Balances): MySummary | null {
  if (!bundle.meId) return null;
  const net = balances[bundle.meId]?.net ?? 0;
  if (net > 0) return { kind: "gets_back", amountPaise: net };
  if (net < 0) return { kind: "owes", amountPaise: -net };
  return { kind: "settled" };
}

/** One "X owes Y ₹N" line, with "you" filled in for the signed-in member. */
export interface DebtLine {
  from: string;
  to: string;
  amountPaise: Paise;
  /** "You owe Rahul", "Rahul owes you", "Neha owes Rahul". */
  text: string;
  /** Your side of it: you get this back, you owe it, or it's between others. */
  tone: "positive" | "negative" | "neutral";
}

/** The raw debts the expenses imply, before any simplification (core pairwiseDebts). */
export function rawDebts(bundle: GroupBundle): Debt[] {
  return pairwiseDebts(bundle.expenses);
}

/** Debts as display lines: the ones involving you first, then biggest first, then member order. */
export function debtLines(bundle: GroupBundle, debts: readonly Debt[]): DebtLine[] {
  const names = new Map(bundle.members.map((m) => [m.id, m.displayName]));
  const order = new Map(bundle.members.map((m, i) => [m.id, i]));
  const rank = (id: string) => order.get(id) ?? Infinity;
  const name = (id: string) => names.get(id) ?? "Someone";
  const me = bundle.meId;
  const lines = debts.map((d): DebtLine => {
    if (d.from === me) return { ...d, text: `You owe ${name(d.to)}`, tone: "negative" };
    if (d.to === me) return { ...d, text: `${name(d.from)} owes you`, tone: "positive" };
    return { ...d, text: `${name(d.from)} owes ${name(d.to)}`, tone: "neutral" };
  });
  const mine = (l: DebtLine) => (l.tone === "neutral" ? 1 : 0);
  return lines.sort(
    (a, b) => mine(a) - mine(b) || b.amountPaise - a.amountPaise || rank(a.from) - rank(b.from) || rank(a.to) - rank(b.to),
  );
}
