import { formatRupees } from "@/core/money";
import { paymentCount, type DebtLine } from "@/lib/balances-view";

const toneClass = { positive: "text-positive", negative: "text-negative", neutral: "" } as const;

/** The Balances tab: who owes whom, raw or simplified. */
export function BalancesView({
  raw,
  simplified,
  simplify,
  onSimplifyChange,
}: {
  raw: DebtLine[];
  simplified: DebtLine[];
  simplify: boolean;
  onSimplifyChange: (on: boolean) => void;
}) {
  const lines = simplify ? simplified : raw;
  if (raw.length === 0) {
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
      {/* The whole row is the switch, so it's easy to hit with a thumb. */}
      <button
        type="button"
        role="switch"
        aria-checked={simplify}
        onClick={() => onSimplifyChange(!simplify)}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-left"
      >
        <span>
          <span className="block font-medium">Simplify debts</span>
          <span className="block text-sm text-muted-foreground" data-testid="payment-count">
            {paymentCount(raw.length, simplified.length)}
          </span>
        </span>
        <span
          aria-hidden
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${simplify ? "bg-primary" : "bg-input"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${simplify ? "translate-x-4" : ""}`}
          />
        </span>
      </button>
      <ul className="divide-y">
        {lines.map((l) => (
          <li key={`${l.from}-${l.to}`} data-testid="debt-row" className="flex min-h-14 items-center justify-between gap-3 py-3">
            <span className={`min-w-0 ${toneClass[l.tone]}`}>{l.text}</span>
            <span className={`shrink-0 font-medium tabular-nums ${toneClass[l.tone]}`}>{formatRupees(l.amountPaise)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
