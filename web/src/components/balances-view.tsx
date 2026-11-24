"use client";

import { Bell, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Avatar } from "@/components/avatar";
import { formatRupees } from "@/core/money";
import { paymentCount, splitMine, type DebtLine } from "@/lib/balances-view";
import type { BundleMember } from "@/lib/data/bundle";

/**
 * The Balances tab (design A, the owner's choice): the Simplify switch on top,
 * then "You and each person" as cards with Pay / Remind, then "Between
 * others". With Simplify on, both sections show the fewest payments instead
 * of the raw debts.
 */
export function BalancesView({
  raw,
  simplified,
  simplify,
  onSimplifyChange,
  members,
}: {
  raw: DebtLine[];
  simplified: DebtLine[];
  simplify: boolean;
  onSimplifyChange: (on: boolean) => void;
  members: BundleMember[];
}) {
  if (raw.length === 0) {
    return (
      <section aria-labelledby="balances-heading" className="flex flex-col items-center gap-2 py-12 text-center">
        <h2 id="balances-heading" className="text-lg font-semibold">
          All settled up
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">No one owes anyone in this group.</p>
      </section>
    );
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id: string) => byId.get(id)?.displayName ?? "Someone";
  const { mine, others } = splitMine(simplify ? simplified : raw);

  return (
    <section aria-labelledby="balances-heading" className="space-y-5">
      <h2 id="balances-heading" className="sr-only">
        Balances
      </h2>
      {/* The whole row is the switch, so it's easy to hit with a thumb. */}
      <button
        type="button"
        role="switch"
        aria-checked={simplify}
        onClick={() => onSimplifyChange(!simplify)}
        className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-2 text-left"
      >
        <span>
          <span className="block font-bold">Simplify debts</span>
          <span className="block text-sm text-muted-foreground" data-testid="payment-count">
            {paymentCount(raw.length, simplified.length)}
          </span>
        </span>
        <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", simplify ? "bg-primary" : "bg-input")}>
          <span
            className={cn(
              "absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform",
              simplify && "translate-x-5",
            )}
          />
        </span>
      </button>

      {mine.length > 0 && (
        <section aria-labelledby="mine-heading" className="space-y-2">
          <h3 id="mine-heading" className="px-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            You and each person
          </h3>
          <ul className="space-y-2">
            {mine.map((l) => {
              const youOwe = l.tone === "negative";
              const other = byId.get(youOwe ? l.to : l.from);
              const otherName = other?.displayName ?? "Someone";
              return (
                <li
                  key={`${l.from}-${l.to}`}
                  data-testid="debt-row"
                  data-from={name(l.from)}
                  data-to={name(l.to)}
                  data-amount={formatRupees(l.amountPaise)}
                  className="rounded-2xl bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    {other && <Avatar id={other.id} name={other.displayName} photoUrl={other.avatarUrl} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{otherName}</p>
                      <p className={cn("text-sm font-semibold", youOwe ? "text-negative" : "text-positive")}>
                        {youOwe ? "you owe" : "owes you"}
                      </p>
                    </div>
                    <p className={cn("text-xl font-extrabold tabular-nums", youOwe ? "text-negative" : "text-positive")}>
                      {formatRupees(l.amountPaise)}
                    </p>
                  </div>
                  {/* Wired to UPI apps and reminders in M9; for now they say so. */}
                  <button
                    type="button"
                    onClick={() =>
                      toast(youOwe ? "Paying with GPay, Paytm or PhonePe is coming soon." : "Reminders are coming soon.", {
                        description: youOwe
                          ? `You'll be able to pay ${otherName} ${formatRupees(l.amountPaise)} straight from here.`
                          : `You'll be able to nudge ${otherName} about ${formatRupees(l.amountPaise)}.`,
                      })
                    }
                    className={cn(
                      "mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold",
                      youOwe ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {youOwe ? <Smartphone aria-hidden className="size-4" /> : <Bell aria-hidden className="size-4" />}
                    {youOwe ? `Pay ${otherName}` : `Remind ${otherName}`}
                    <span className="rounded-full bg-background/25 px-2 py-0.5 text-[0.7rem] font-semibold">Coming soon</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="others-heading" className="space-y-2">
          <h3 id="others-heading" className="px-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Between others
          </h3>
          <ul className="divide-y rounded-2xl bg-card px-4">
            {others.map((l) => {
              const from = byId.get(l.from);
              const to = byId.get(l.to);
              return (
                <li
                  key={`${l.from}-${l.to}`}
                  data-testid="debt-row"
                  data-from={name(l.from)}
                  data-to={name(l.to)}
                  data-amount={formatRupees(l.amountPaise)}
                  className="flex min-h-14 items-center gap-3 py-2"
                >
                  <span className="flex shrink-0">
                    {from && <Avatar id={from.id} name={from.displayName} photoUrl={from.avatarUrl} size="xs" />}
                    {to && (
                      <Avatar id={to.id} name={to.displayName} photoUrl={to.avatarUrl} size="xs" className="-ml-1.5 ring-2 ring-card" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l.text}</span>
                  <span className="shrink-0 font-bold tabular-nums">{formatRupees(l.amountPaise)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </section>
  );
}
