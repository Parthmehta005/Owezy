"use client";

import { useState } from "react";
import { dateLabel, groupByDate, indiaDate } from "@/core/dates";
import { expenseEffect, type Effect } from "@/core/effect";
import { formatInr } from "@/core/money";
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
}: {
  expenses: BundleExpense[];
  members: BundleMember[];
  meId: string | null;
}) {
  const today = useIndiaToday();
  const names = new Map(members.map((m) => [m.id, m.displayName]));
  const days = groupByDate(expenses, (e) => e.date);

  return (
    <section aria-labelledby="expenses-heading" className="space-y-4">
      <h2 id="expenses-heading" className="sr-only">
        Expenses
      </h2>
      {days.map((day) => (
        <div key={day.date}>
          <h3 className="pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {dateLabel(day.date, today)}
          </h3>
          <ul className="divide-y">
            {day.items.map((e) => (
              <ExpenseRow key={e.id} expense={e} payerName={e.payerId === meId ? "You" : (names.get(e.payerId) ?? "Someone")} meId={meId} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function ExpenseRow({ expense, payerName, meId }: { expense: BundleExpense; payerName: string; meId: string | null }) {
  const effect: Effect = meId ? expenseEffect(expense, meId) : { kind: "not_involved" };
  return (
    <li className="flex min-h-16 items-center gap-3 py-3" data-testid="expense-row">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{expense.description}</p>
        <p className="truncate text-sm text-muted-foreground">
          {payerName} paid {formatInr(expense.totalPaise)}
        </p>
      </div>
      <EffectLabel effect={effect} />
    </li>
  );
}

function EffectLabel({ effect }: { effect: Effect }) {
  switch (effect.kind) {
    case "lent":
      return (
        <div className="shrink-0 text-right">
          <p className="text-xs text-positive">you lent</p>
          <p className="font-medium text-positive tabular-nums">{formatInr(effect.amountPaise)}</p>
        </div>
      );
    case "borrowed":
      return (
        <div className="shrink-0 text-right">
          <p className="text-xs text-negative">you borrowed</p>
          <p className="font-medium text-negative tabular-nums">{formatInr(effect.amountPaise)}</p>
        </div>
      );
    case "even":
      return <p className="shrink-0 text-xs text-muted-foreground">no balance change</p>;
    case "not_involved":
      return <p className="shrink-0 text-xs text-muted-foreground">not involved</p>;
  }
}
