"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Settings } from "lucide-react";
import { indiaDate } from "@/core/dates";
import { AvatarColors } from "@/components/avatar";
import { BalanceSummary } from "@/components/balance-summary";
import { BalancesView } from "@/components/balances-view";
import { ExpenseList } from "@/components/expense-list";
import { ExpenseSheet, draftFromExpense, newDraft, type ExpenseDraft } from "@/components/expense-sheet";
import { GroupSwitcher } from "@/components/group-switcher";
import { MembersButton } from "@/components/members-button";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { groupKeys, type GroupBundle } from "@/lib/data/bundle";
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
import { debtLines, groupBalances, mySummary, rawDebts, simplifiedDebts } from "@/lib/balances-view";
import type { GroupSummary } from "@/lib/data/groups";
import { useGroupBundle } from "@/lib/data/use-group-bundle";
import { draftToResume, removeDraft, saveDraft, useDrafts } from "@/lib/expense-drafts";

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
  const { data: bundle, isRefetchError, isFetching, refetch } = useGroupBundle(groupId, userId, initial, initialAt);
  const createExpense = useCreateExpense(groupId);
  const updateExpense = useUpdateExpense(groupId);
  const deleteExpense = useDeleteExpense(groupId);
  const restoreExpense = useRestoreExpense(groupId);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [today] = useState(() => indiaDate(new Date()));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [resumed, setResumed] = useState(false);
  // Minimised expenses, kept on the phone until saved or discarded.
  const drafts = useDrafts(groupId);
  const keyboardPrimer = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("expenses");
  const [simplify, setSimplify] = useState(false);
  const view = useMemo(() => {
    if (!bundle) return null;
    const balances = groupBalances(bundle);
    return {
      summary: mySummary(bundle, balances),
      raw: debtLines(bundle, rawDebts(bundle)),
      // Your own standing with each person, for the balance box.
      mine: debtLines(bundle, rawDebts(bundle)).filter((l) => l.tone !== "neutral"),
      simplified: debtLines(bundle, simplifiedDebts(bundle, balances)),
    };
  }, [bundle]);

  const nextAttempt = (d: ExpenseDraft | null) => (d?.attempt ?? 0) + 1;

  function openSheet(d: ExpenseDraft, wasMinimised: boolean) {
    setNotice(null);
    setDraft(d);
    setResumed(wasMinimised);
    setSheetOpen(true);
  }

  /** Keep the draft on the phone while it has changes (or was already kept). */
  function keepDraft(d: ExpenseDraft, changed: boolean) {
    if (changed || resumed) saveDraft(groupId, d);
    else removeDraft(groupId, d.id);
  }

  function discard(draftId: string) {
    removeDraft(groupId, draftId);
    setSheetOpen(false);
  }

  /** Bring the sheet back with what was typed and why it failed; Save retries. */
  function reopenWithError(typed: ExpenseDraft, error: unknown) {
    saveDraft(groupId, typed); // still unsaved: keep it
    setResumed(true);
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
    removeDraft(groupId, typed.id);
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
    removeDraft(groupId, expenseId);
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

  const resumable = draftToResume(drafts);

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
    <AvatarColors memberIds={bundle.members.map((m) => m.id)}>
      <PullToRefresh onRefresh={() => refetch()} />
      <header className="sticky top-0 z-10 flex items-center gap-1 bg-background/95 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 backdrop-blur">
        <GroupSwitcher current={bundle.group} groups={groups} />
        <span className="flex-1" />
        <MembersButton members={bundle.members} />
        <Link
          href={`/g/${bundle.group.id}/settings`}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings aria-hidden className="size-5" />
          <span className="sr-only">Group settings</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-5 px-4 pt-3 pb-28">
        {notice && (
          <p role="alert" className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {notice}
          </p>
        )}
        {/* A background refresh failed (after retries): keep showing what we have. */}
        {isRefetchError && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-lg border px-3 py-1 text-sm">
            <span className="text-muted-foreground">Couldn&apos;t refresh. Showing what was loaded before.</span>
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
              {isFetching ? "Refreshing…" : "Retry"}
            </Button>
          </div>
        )}
        {view?.summary && (
          <BalanceSummary summary={view.summary} people={view.mine} members={bundle.members} onShowAll={() => setTab("balances")} />
        )}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
          </TabsList>
          <TabsContent value="expenses" className="flex flex-col text-base">
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
                onSelect={(e) => openSheet(drafts[e.id] ?? draftFromExpense(e), e.id in drafts)}
              />
            )}
          </TabsContent>
          <TabsContent value="balances" className="text-base">
            <BalancesView
              raw={view?.raw ?? []}
              simplified={view?.simplified ?? []}
              simplify={simplify}
              onSimplifyChange={setSimplify}
              members={bundle.members}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* iPhone opens the keyboard only if focus happens during the tap itself.
          The + button focuses this field synchronously; the sheet then moves
          focus to the amount and the number pad stays up. */}
      <input ref={keyboardPrimer} aria-hidden tabIndex={-1} inputMode="decimal" className="fixed top-0 left-0 size-px opacity-0" />
      <Button
        size="lg"
        className="fixed right-[max(1rem,calc((100vw-480px)/2+1rem))] bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20 h-14 gap-2 rounded-full pr-6 pl-5 text-base font-bold shadow-lg shadow-primary/30"
        onClick={() => {
          keyboardPrimer.current?.focus();
          const minimised = Object.values(drafts).find((d) => d.mode === "add");
          openSheet(minimised ?? newDraft(bundle.meId ?? bundle.members[0].id, today), Boolean(minimised));
        }}
      >
        <Plus aria-hidden className="size-5" strokeWidth={2.6} />
        Add expense
      </Button>

      {/* A minimised expense waits here until it's saved or discarded. */}
      {!sheetOpen && resumable && (
        <button
          type="button"
          data-testid="resume-draft"
          onClick={() => {
            keyboardPrimer.current?.focus();
            openSheet(resumable, true);
          }}
          className="fixed right-[max(1rem,calc((100vw-480px)/2+1rem))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-[max(1rem,calc((100vw-480px)/2+1rem))] z-20 flex min-h-12 items-center gap-3 rounded-2xl border bg-card px-4 text-left shadow-lg"
        >
          <Pencil aria-hidden className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-bold">{resumable.mode === "edit" ? "Continue editing" : "Continue expense"}</span>
            {resumable.amountText.trim() && <span className="text-muted-foreground"> · ₹{resumable.amountText.trim()}</span>}
            {resumable.description.trim() && <span className="text-muted-foreground"> · {resumable.description.trim()}</span>}
          </span>
        </button>
      )}

      {draft && (
        <ExpenseSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          draft={draft}
          members={bundle.members}
          meId={bundle.meId}
          today={today}
          resumed={resumed}
          onSave={save}
          onDelete={remove}
          onDraftChange={keepDraft}
          onDiscard={discard}
        />
      )}
    </AvatarColors>
  );
}
