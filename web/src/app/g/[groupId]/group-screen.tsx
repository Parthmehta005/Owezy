"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Settings } from "lucide-react";
import { indiaDate } from "@/core/dates";
import { ExpenseList } from "@/components/expense-list";
import { ExpenseSheet, draftFromExpense, newDraft, type ExpenseDraft } from "@/components/expense-sheet";
import { GroupSwitcher } from "@/components/group-switcher";
import { Button } from "@/components/ui/button";
import { groupKeys, type BundleMember, type GroupBundle } from "@/lib/data/bundle";
import {
  isConflict,
  isGone,
  saveErrorMessage,
  useCreateExpense,
  useDeleteExpense,
  useRestoreExpense,
  useUpdateExpense,
  type NewExpense,
} from "@/lib/data/expense-mutations";
import type { GroupSummary } from "@/lib/data/groups";
import { useGroupBundle } from "@/lib/data/use-group-bundle";

export function GroupScreen({
  groupId,
  userId,
  initial,
  initialAt,
  groups,
}: {
  groupId: string;
  userId: string;
  initial: GroupBundle;
  initialAt: number;
  groups: GroupSummary[];
}) {
  const { data: bundle } = useGroupBundle(groupId, userId, initial, initialAt);
  const createExpense = useCreateExpense(groupId);
  const updateExpense = useUpdateExpense(groupId);
  const deleteExpense = useDeleteExpense(groupId);
  const restoreExpense = useRestoreExpense(groupId);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [today] = useState(() => indiaDate(new Date()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const keyboardPrimer = useRef<HTMLInputElement>(null);

  const nextAttempt = (d: ExpenseDraft | null) => (d?.attempt ?? 0) + 1;

  /** Bring the sheet back with what was typed and why it failed; Save retries. */
  function reopenWithError(typed: ExpenseDraft, error: unknown) {
    setDraft((d) => ({
      ...typed,
      error: `Not saved: ${saveErrorMessage(error)} Your details are below; tap Save to try again.`,
      attempt: nextAttempt(d),
    }));
    setSheetOpen(true);
  }

  function save(expense: NewExpense, typed: ExpenseDraft) {
    setSheetOpen(false);
    setNotice(null);
    if (typed.mode === "add") {
      createExpense.mutate(expense, { onError: (error) => reopenWithError(typed, error) });
      return;
    }
    updateExpense.mutate(
      { ...expense, expectedVersion: typed.version ?? 1 },
      {
        onError: async (error) => {
          if (!isConflict(error) && !isGone(error)) return reopenWithError(typed, error);
          // Someone else changed or deleted it first: load the latest and show that.
          await queryClient.refetchQueries({ queryKey: groupKeys.bundle(groupId) });
          const latest = queryClient
            .getQueryData<GroupBundle | null>(groupKeys.bundle(groupId))
            ?.expenses.find((e) => e.id === expense.id);
          if (!latest) {
            setNotice(`"${typed.description.trim() || "That expense"}" was deleted by someone else, so your changes weren't saved.`);
            return;
          }
          setDraft((d) =>
            draftFromExpense(latest, {
              error: "Someone else changed this expense while you were editing. These are the latest details; make your change again.",
              attempt: nextAttempt(d),
            }),
          );
          setSheetOpen(true);
        },
      },
    );
  }

  function remove(expenseId: string) {
    const expense = bundle?.expenses.find((e) => e.id === expenseId);
    if (!expense) return;
    setSheetOpen(false);
    setNotice(null);
    const name = expense.description;
    const deleting = deleteExpense.mutateAsync(expense);
    deleting.catch((error) => toast.error(`Couldn't delete "${name}". ${saveErrorMessage(error)}`));
    toast(`Deleted "${name}"`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: async () => {
          // Wait for the delete to land first, or a slow delete could
          // arrive after the restore and remove it again.
          try {
            await deleting;
          } catch {
            return; // the delete failed, so it's still there
          }
          restoreExpense.mutate(expense, {
            onError: (error) => toast.error(`Couldn't bring back "${name}". ${saveErrorMessage(error)}`),
          });
        },
      },
    });
  }

  // A refresh found the group gone for this user (e.g. they left on another device).
  if (!bundle) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold">You&apos;re no longer in this group</h1>
        <Button asChild variant="outline">
          <Link href="/">Go to my groups</Link>
        </Button>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 backdrop-blur">
        <GroupSwitcher current={bundle.group} groups={groups} />
        <Link
          href={`/g/${bundle.group.id}/settings`}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings aria-hidden className="size-5" />
          <span className="sr-only">Group settings</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-8 px-4 pt-6 pb-28">
        {notice && (
          <p role="alert" className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {notice}
          </p>
        )}
        <Members members={bundle.members} />
        {bundle.expenses.length === 0 ? (
          <section aria-labelledby="expenses-heading" className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <h2 id="expenses-heading" className="text-lg font-medium">
              No expenses yet
            </h2>
            <p className="max-w-xs text-sm text-muted-foreground">Expenses added to this group will show up here.</p>
          </section>
        ) : (
          <ExpenseList
            expenses={bundle.expenses}
            members={bundle.members}
            meId={bundle.meId}
            onSelect={(e) => {
              setNotice(null);
              setDraft(draftFromExpense(e));
              setSheetOpen(true);
            }}
          />
        )}
      </main>

      {/* iPhone opens the keyboard only if focus happens during the tap itself.
          The + button focuses this field synchronously; the sheet then moves
          focus to the amount and the number pad stays up. */}
      <input ref={keyboardPrimer} aria-hidden tabIndex={-1} inputMode="decimal" className="fixed top-0 left-0 size-px opacity-0" />
      <Button
        size="icon-lg"
        className="fixed right-[max(1.25rem,calc((100vw-480px)/2+1.25rem))] bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-lg"
        onClick={() => {
          keyboardPrimer.current?.focus();
          setDraft(newDraft(bundle.meId ?? bundle.members[0].id, today));
          setSheetOpen(true);
        }}
      >
        <Plus aria-hidden className="size-6" />
        <span className="sr-only">Add expense</span>
      </Button>

      {draft && (
        <ExpenseSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          draft={draft}
          members={bundle.members}
          meId={bundle.meId}
          today={today}
          onSave={save}
          onDelete={remove}
        />
      )}
    </>
  );
}

function Members({ members }: { members: BundleMember[] }) {
  return (
    <section aria-labelledby="members-heading" className="space-y-3">
      <h2 id="members-heading" className="text-sm font-medium text-muted-foreground">
        {members.length} {members.length === 1 ? "member" : "members"}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {members.map((m) => (
          <li
            key={m.id}
            className={
              m.isPlaceholder
                ? "rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground"
                : "rounded-full bg-muted px-3 py-1 text-sm"
            }
          >
            {m.displayName}
            {m.isMe && <span className="text-muted-foreground"> (you)</span>}
            {m.isPlaceholder && <span className="sr-only"> (not joined yet)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
