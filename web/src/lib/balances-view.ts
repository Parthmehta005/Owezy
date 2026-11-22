/**
 * What the group screen shows about balances, worked out from the cached
 * group bundle with the `core/` functions (no extra server call). Expenses
 * still being saved count too, so the numbers move the moment you tap Save.
 */
import { computeBalances } from "@/core/balances";
import type { Paise } from "@/core/money";
import type { Balances } from "@/core/types";
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
