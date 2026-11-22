import { formatInr } from "@/core/money";
import type { DebtLine } from "@/lib/balances-view";

const toneClass = { positive: "text-positive", negative: "text-negative", neutral: "" } as const;

/** The Balances tab: who owes whom. */
export function BalancesView({ lines }: { lines: DebtLine[] }) {
  if (lines.length === 0) {
    return (
      <section aria-labelledby="balances-heading" className="flex flex-col items-center gap-2 py-12 text-center">
        <h2 id="balances-heading" className="text-lg font-medium">
          All settled up
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">No one owes anyone in this group.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="balances-heading" className="space-y-2">
      <h2 id="balances-heading" className="sr-only">
        Balances
      </h2>
      <ul className="divide-y">
        {lines.map((l) => (
          <li key={`${l.from}-${l.to}`} data-testid="debt-row" className="flex min-h-14 items-center justify-between gap-3 py-3">
            <span className={`min-w-0 ${toneClass[l.tone]}`}>{l.text}</span>
            <span className={`shrink-0 font-medium tabular-nums ${toneClass[l.tone]}`}>{formatInr(l.amountPaise)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
