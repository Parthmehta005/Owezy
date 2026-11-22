import { formatInr } from "@/core/money";
import type { MySummary } from "@/lib/balances-view";

/** The big line at the top of the group screen: your net across the whole group. */
export function BalanceSummary({ summary }: { summary: MySummary }) {
  return (
    <section aria-label="Your balance" data-testid="my-summary" className="space-y-1">
      {summary.kind === "settled" ? (
        <p className="text-2xl font-semibold">All settled</p>
      ) : (
        <>
          <p className={summary.kind === "gets_back" ? "text-sm text-positive" : "text-sm text-negative"}>
            {summary.kind === "gets_back" ? "You get back" : "You owe"}
          </p>
          <p
            className={
              summary.kind === "gets_back"
                ? "text-3xl font-semibold text-positive tabular-nums"
                : "text-3xl font-semibold text-negative tabular-nums"
            }
          >
            {formatInr(summary.amountPaise)}
          </p>
        </>
      )}
    </section>
  );
}
