"use client";

import { useState } from "react";
import { dateLabel, groupByDate, indiaDate } from "@/core/dates";
import { expenseEffect, type Effect } from "@/core/effect";
import { formatRupees } from "@/core/money";
import { Avatar } from "@/components/avatar";
import type { BundleExpense, BundleMember } from "@/lib/data/bundle";

/** Today in India, fixed for the life of the screen (re-read on the next visit). */
function useIndiaToday() {
  const [today] = useState(() => indiaDate(new Date()));
  return today;
}

export function ExpenseList({
  expenses,
  members,
  meId,
  onSelect,
}: {
  expenses: BundleExpense[];
  members: BundleMember[];
  meId: string | null;
  onSelect: (expense: BundleExpense) => void;
}) {
  const today = useIndiaToday();
  const byId = new Map(members.map((m) => [m.id, m]));
  const days = groupByDate(expenses, (e) => e.date);

  return (
    <section aria-labelledby="expenses-heading" className="space-y-5">
      <h2 id="expenses-heading" className="sr-only">
        Expenses
      </h2>
      {days.map((day) => (
        <div key={day.date}>
          <h3 className="px-1 pb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            {dateLabel(day.date, today)}
          </h3>
          <ul className="divide-y rounded-2xl bg-card px-3">
            {day.items.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                payer={byId.get(e.payerId)}
                payerName={e.payerId === meId ? "You" : (byId.get(e.payerId)?.displayName ?? "Someone")}
                meId={meId}
                onSelect={() => onSelect(e)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function ExpenseRow({
  expense,
  payer,
  payerName,
  meId,
  onSelect,
}: {
  expense: BundleExpense;
  payer: BundleMember | undefined;
  payerName: string;
  meId: string | null;
  onSelect: () => void;
}) {
  const effect: Effect = meId ? expenseEffect(expense, meId) : { kind: "not_involved" };
  return (
    <li data-testid="expense-row" data-pending={expense.pending || undefined}>
      {/* Tap to edit. Not while it's still saving. */}
      <button
        type="button"
        onClick={onSelect}
        disabled={expense.pending}
        className="flex min-h-16 w-full items-center gap-3 py-3 text-left disabled:cursor-default"
      >
      <Avatar id={expense.payerId} name={payer?.displayName ?? "?"} photoUrl={payer?.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{expense.description}</p>
        <p className="truncate text-sm text-muted-foreground">
          {payerName} paid {formatRupees(expense.totalPaise)}
          {expense.pending && <span className="italic"> · Saving…</span>}
        </p>
      </div>
      <EffectLabel effect={effect} />
      </button>
    </li>
  );
}

function EffectLabel({ effect }: { effect: Effect }) {
  switch (effect.kind) {
    case "lent":
      return (
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-positive">you lent</p>
          <p className="font-bold text-positive tabular-nums">{formatRupees(effect.amountPaise)}</p>
        </div>
      );
    case "borrowed":
      return (
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-negative">you borrowed</p>
          <p className="font-bold text-negative tabular-nums">{formatRupees(effect.amountPaise)}</p>
        </div>
      );
    case "even":
      return <p className="shrink-0 text-xs text-muted-foreground">no balance change</p>;
    case "not_involved":
      return <p className="shrink-0 text-xs text-muted-foreground">not involved</p>;
  }
}
