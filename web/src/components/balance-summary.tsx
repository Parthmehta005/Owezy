"use client";

import { cn } from "cn";
import { Avatar } from "@/components/avatar";
import { formatRupees } from "@/core/money";
import type { DebtLine, MySummary } from "@/lib/balances-view";
import type { BundleMember } from "@/lib/data/bundle";
import { useCountedNumber } from "@/lib/hooks/use-counted-number";

/** How many people the box lists before "and N more". */
const SHOWN = 3;

/**
 * The box at the top of the group screen: your net across the group, and the
 * people behind it ("Rahul owes you ₹965"). Sharper corners and no lines
 * between people, as the owner chose. Filled cobalt when you get money back,
 * burnt orange when you owe, plain card when settled.
 */
export function BalanceSummary({
  summary,
  people,
  members,
  onShowAll,
}: {
  summary: MySummary;
  /** Your raw debts with each person (biggest first). */
  people: DebtLine[];
  members: BundleMember[];
  onShowAll: () => void;
}) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const filled = summary.kind !== "settled";
  const total = useCountedNumber(summary.kind === "settled" ? 0 : summary.amountPaise);
  const rest = people.length - SHOWN;
  return (
    <section
      aria-label="Your balance"
      data-testid="my-summary"
      className={cn(
        "rounded-[0.5rem] px-5 pt-5 pb-3",
        summary.kind === "gets_back" && "bg-primary text-primary-foreground",
        summary.kind === "owes" && "bg-negative text-primary-foreground",
        summary.kind === "settled" && "border bg-card pb-5",
      )}
    >
      {summary.kind === "settled" ? (
        <p className="text-2xl font-bold tracking-tight">All settled</p>
      ) : (
        <>
          <p className="text-sm font-semibold">{summary.kind === "gets_back" ? "You get back" : "You owe"}</p>
          <p className="text-[2.75rem] leading-tight font-extrabold tracking-tight tabular-nums" data-testid="summary-total">
            {formatRupees(total)}
          </p>
        </>
      )}
      {filled && people.length > 0 && (
        <ul className="mt-2" data-testid="summary-people">
          {people.slice(0, SHOWN).map((l) => {
            // The other person: who you owe, or who owes you.
            const other = byId.get(l.tone === "negative" ? l.to : l.from);
            return (
              <li key={`${l.from}-${l.to}`} className="flex min-h-11 items-center gap-3">
                {other && (
                  <Avatar id={other.id} name={other.displayName} photoUrl={other.avatarUrl} size="xs" className="ring-2 ring-white/40" />
                )}
                <span className="flex-1 truncate text-[0.95rem] font-medium">{l.text}</span>
                <span className="font-bold tabular-nums">{formatRupees(l.amountPaise)}</span>
              </li>
            );
          })}
          {rest > 0 && (
            <li>
              <button type="button" onClick={onShowAll} className="min-h-11 text-sm font-semibold underline underline-offset-4">
                and {rest} more
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
