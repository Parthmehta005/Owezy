"use client";

import { Avatar } from "@/components/avatar";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, ChevronDown, Minimize2 } from "lucide-react";
import { cn } from "cn";
import { addDays, dateLabel } from "@/core/dates";
import { expenseEffect } from "@/core/effect";
import { formatRupees, parseAmount, toAmountInput } from "@/core/money";
import { autoFillRemainder, buildShares } from "@/core/splits";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BundleExpense, BundleMember } from "@/lib/data/bundle";
import type { NewExpense } from "@/lib/data/expense-mutations";
import { hasContent } from "@/lib/expense-drafts";

/** What the sheet starts from: a fresh expense, an existing one to edit, or one whose save failed. */
export interface ExpenseDraft {
  mode: "add" | "edit";
  /** Add: generated here and kept across retries, so the server can't create a duplicate. Edit: the expense's id. */
  id: string;
  /** Edit: the version being edited (stale-edit check). */
  version?: number;
  amountText: string;
  description: string;
  payerId: string;
  date: string;
  splitMode: "equal" | "unequal";
  /** Equal mode: who's included (undefined = everyone). */
  includedIds?: string[];
  /** Unequal mode: what was typed per member. */
  unequalTexts?: Record<string, string>;
  /** Why the last save failed, if it did. */
  error?: string;
  /** Failed attempts so far. Each failure remounts the form so Save works again,
   * even if the error message is the same as last time. */
  attempt?: number;
}

export function newDraft(payerId: string, today: string): ExpenseDraft {
  return { mode: "add", id: crypto.randomUUID(), amountText: "", description: "", payerId, date: today, splitMode: "equal" };
}

/** A draft for editing an existing expense, filled in with its current details. */
export function draftFromExpense(expense: BundleExpense, extra?: Partial<ExpenseDraft>): ExpenseDraft {
  const shareIds = Object.keys(expense.shares);
  return {
    mode: "edit",
    id: expense.id,
    version: expense.version,
    amountText: toAmountInput(expense.totalPaise),
    description: expense.description,
    payerId: expense.payerId,
    date: expense.date,
    splitMode: expense.splitType,
    includedIds: expense.splitType === "equal" ? shareIds : undefined,
    unequalTexts:
      expense.splitType === "unequal"
        ? Object.fromEntries(Object.entries(expense.shares).map(([id, paise]) => [id, toAmountInput(paise)]))
        : undefined,
    ...extra,
  };
}

function tryParse(text: string) {
  try {
    return parseAmount(text);
  } catch {
    return null;
  }
}

/** A per-person amount: blank counts as 0; unreadable text is null. */
function parseShareText(text: string) {
  if (text.trim() === "") return 0;
  try {
    return parseAmount(text, { allowZero: true });
  } catch {
    return null;
  }
}

export function ExpenseSheet({
  open,
  onOpenChange,
  draft,
  members,
  meId,
  today,
  resumed,
  onSave,
  onDelete,
  onDraftChange,
  onDiscard,
}: {
  open: boolean;
  /** Closing (swipe down, tap outside, the minimise button) only minimises: the draft is kept. */
  onOpenChange: (open: boolean) => void;
  draft: ExpenseDraft;
  members: BundleMember[];
  meId: string | null;
  today: string;
  /** This draft was minimised earlier and is being continued. */
  resumed: boolean;
  onSave: (expense: NewExpense, draft: ExpenseDraft) => void;
  /** Edit mode only. */
  onDelete: (expenseId: string) => void;
  /** Every change, so the draft can be kept on the phone. `changed`: differs from how it opened. */
  onDraftChange: (draft: ExpenseDraft, changed: boolean) => void;
  /** Cancel: throw this draft away. */
  onDiscard: (draftId: string) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent
        className="h-[calc(100dvh-0.75rem-env(safe-area-inset-top))] bg-background data-[vaul-drawer-direction=bottom]:max-h-none"
        // Start on the amount (not the Cancel button), so the number pad is up.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("amount")?.focus();
        }}
      >
        {/* Remount per draft so a retry starts from what was typed. */}
        <ExpenseForm key={`${draft.id}:${draft.attempt ?? 0}`} draft={draft} members={members} meId={meId} today={today}
          resumed={resumed} onMinimise={() => onOpenChange(false)} onDiscard={onDiscard} onDraftChange={onDraftChange}
          onSave={onSave} onDelete={onDelete} />
      </DrawerContent>
    </Drawer>
  );
}

function ExpenseForm({
  draft,
  members,
  meId,
  today,
  resumed,
  onMinimise,
  onDiscard,
  onDraftChange,
  onSave,
  onDelete,
}: {
  draft: ExpenseDraft;
  members: BundleMember[];
  meId: string | null;
  today: string;
  resumed: boolean;
  onMinimise: () => void;
  onDiscard: (draftId: string) => void;
  onDraftChange: (draft: ExpenseDraft, changed: boolean) => void;
  onSave: (expense: NewExpense, draft: ExpenseDraft) => void;
  onDelete: (expenseId: string) => void;
}) {
  const [amountText, setAmountText] = useState(draft.amountText);
  const [description, setDescription] = useState(draft.description);
  const [payerId, setPayerId] = useState(draft.payerId);
  const [date, setDate] = useState(draft.date);
  const [splitMode, setSplitMode] = useState(draft.splitMode);
  const [includedIds, setIncludedIds] = useState<string[]>(draft.includedIds ?? members.map((m) => m.id));
  const [unequalTexts, setUnequalTexts] = useState<Record<string, string>>(draft.unequalTexts ?? {});
  const [payerOpen, setPayerOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const total = tryParse(amountText);
  // Keep member order (it decides who gets leftover paise in an equal split).
  const included = members.map((m) => m.id).filter((id) => includedIds.includes(id));
  // Unequal: empty fields are undefined, unreadable ones null. Once only one
  // person is left empty, their share fills itself with what's left.
  const typedAmounts = Object.fromEntries(
    members.map((m) => {
      const text = unequalTexts[m.id] ?? "";
      return [m.id, text.trim() === "" ? undefined : parseShareText(text)];
    }),
  );
  const autoFill = splitMode === "unequal" ? autoFillRemainder(total, typedAmounts) : null;
  const split =
    splitMode === "equal"
      ? buildShares({ mode: "equal", totalPaise: total, memberIds: included })
      : buildShares({
          mode: "unequal",
          totalPaise: total,
          amounts: Object.fromEntries(
            members.map((m) => [m.id, autoFill?.memberId === m.id ? autoFill.paise : (typedAmounts[m.id] ?? 0)]),
          ),
        });
  const shares = split.shares;
  const canSave = Boolean(total && shares && description.trim()) && !submitted;
  const payer = members.find((m) => m.id === payerId);

  // What's on screen now, as a draft (kept on the phone as it changes), and how it opened.
  const snapshot: ExpenseDraft = { ...draft, amountText, description, payerId, date, splitMode, includedIds, unequalTexts, error: undefined };
  const [opened] = useState(snapshot);
  const changed = hasContent(snapshot, opened);
  const report = useRef(onDraftChange);
  useEffect(() => {
    report.current = onDraftChange;
  });
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    report.current({ ...draft, amountText, description, payerId, date, splitMode, includedIds, unequalTexts, error: undefined }, changed);
  }, [draft, amountText, description, payerId, date, splitMode, includedIds, unequalTexts, changed]);

  /** Cancel: throw it away, asking first if there's anything to lose. */
  function cancel() {
    if (resumed || changed) setConfirmingDiscard(true);
    else onDiscard(draft.id);
  }

  function save(event?: FormEvent) {
    event?.preventDefault();
    if (!canSave || !total || !shares) return;
    setSubmitted(true); // a second tap before the sheet closes does nothing
    onSave(
      { id: draft.id, description: description.trim(), payerId, totalPaise: total, splitType: splitMode, shares, date },
      { ...draft, amountText, description, payerId, date, splitMode, includedIds, unequalTexts, error: undefined },
    );
  }

  let preview = "";
  if (total && shares && meId) {
    const effect = expenseEffect({ payerId, totalPaise: total, shares }, meId);
    preview =
      effect.kind === "lent"
        ? `You get back ${formatRupees(effect.amountPaise)}`
        : effect.kind === "borrowed"
          ? `You owe ${formatRupees(effect.amountPaise)}`
          : "No change to your balance";
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      {/* Actions at the top: the on-screen keyboard covers the bottom half of the screen. */}
      <div className="flex items-center justify-between gap-1 px-2 pb-2">
        <div className="flex items-center">
          <Button type="button" variant="ghost" size="icon" aria-label="Minimise" title="Minimise" onClick={onMinimise}>
            <Minimize2 aria-hidden className="size-5" />
          </Button>
          <Button type="button" variant="ghost" className="px-2" onClick={cancel}>
            Cancel
          </Button>
        </div>
        <DrawerTitle className="truncate text-base font-bold">{draft.mode === "edit" ? "Edit expense" : "Add expense"}</DrawerTitle>
        <Button type="submit" disabled={!canSave} className="rounded-full px-5">
          Save
        </Button>
      </div>
      <DrawerDescription className="sr-only">Enter the amount, what it was for, who paid and how to split it.</DrawerDescription>
      {confirmingDiscard && (
        <div role="alertdialog" aria-label="Discard?" className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3 shadow-sm">
          <p className="flex-1 text-sm font-semibold">{draft.mode === "edit" ? "Discard your changes?" : "Discard this expense?"}</p>
          <Button type="button" variant="ghost" onClick={() => setConfirmingDiscard(false)}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={() => onDiscard(draft.id)}>
            Discard
          </Button>
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pt-2 pb-6">
        {draft.error && (
          <p role="alert" className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {draft.error}
          </p>
        )}

        {/* 1. Amount, big and centred. */}
        <div className="flex flex-col items-center">
          <Label htmlFor="amount" className="text-xs font-semibold text-muted-foreground">
            Amount<span className="sr-only"> in rupees</span>
          </Label>
          <div className="flex items-baseline justify-center gap-1">
            <span aria-hidden className="text-3xl font-bold text-muted-foreground">
              ₹
            </span>
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              placeholder="0"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  descriptionRef.current?.focus();
                }
              }}
              aria-invalid={amountText.trim() !== "" && !total ? true : undefined}
              style={{ width: `calc(${Math.max(1, amountText.length)}ch + 0.1em)` }}
              className="h-16 max-w-[80vw] bg-transparent text-left text-5xl font-extrabold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          {amountText.trim() !== "" && !total && <p className="text-sm text-destructive">Enter an amount like 450 or 99.50</p>}
        </div>

        {/* 2. What it was for. */}
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs font-semibold text-muted-foreground">
            What was it for?
          </Label>
          <Input
            ref={descriptionRef}
            id="description"
            name="description"
            placeholder="e.g. Dinner"
            maxLength={100}
            enterKeyHint="done"
            autoCapitalize="sentences"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-12"
          />
        </div>

        {/* 3. Who paid (you by default; the list opens inline) and the date. */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={payerOpen}
              onClick={() => setPayerOpen((o) => !o)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm font-semibold",
                payerOpen && "border-primary",
              )}
            >
              {payer && <Avatar id={payer.id} name={payer.displayName} photoUrl={payer.avatarUrl} size="xs" />}
              Paid by {payerId === meId ? "you" : (payer?.displayName ?? "…")}
              <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform", payerOpen && "rotate-180")} />
            </button>
            <label className="relative flex min-h-11 items-center gap-2 rounded-full border bg-card px-3 text-sm font-semibold focus-within:ring-3 focus-within:ring-ring/50">
              <CalendarDays aria-hidden className="size-4 text-primary" />
              <span>{dateLabel(date, today)}</span>
              {/* The phone's own date picker, laid over the chip. */}
              <input
                type="date"
                aria-label="Date"
                value={date}
                min="2000-01-01"
                max={addDays(today, 365)}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                // -inset-px: cover the chip's border too, so the target is the full 44px.
                className="absolute -inset-px cursor-pointer opacity-0"
              />
            </label>
          </div>
          {payerOpen && (
            <fieldset className="overflow-hidden rounded-2xl bg-card">
              <legend className="sr-only">Who paid?</legend>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={m.id === payerId}
                  onClick={() => {
                    setPayerId(m.id);
                    setPayerOpen(false);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 border-b px-3 text-left last:border-b-0"
                >
                  <Avatar id={m.id} name={m.displayName} photoUrl={m.avatarUrl} size="sm" />
                  <span className="flex-1">{m.id === meId ? `${m.displayName} (you)` : m.displayName}</span>
                  {m.id === payerId && <Check aria-hidden className="size-4 text-primary" />}
                </button>
              ))}
            </fieldset>
          )}
        </div>

        {/* 4 + 5. How to split, and the people in it (always visible). */}
        <SplitPanel
          members={members}
          meId={meId}
          mode={splitMode}
          onModeChange={setSplitMode}
          includedIds={includedIds}
          onToggle={(id) => setIncludedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))}
          equalShares={splitMode === "equal" ? shares : null}
          unequalTexts={unequalTexts}
          onUnequalChange={(id, text) => setUnequalTexts((t) => ({ ...t, [id]: text }))}
          totalPaise={total}
          remainingPaise={split.remainingPaise}
          autoFill={autoFill}
        />
        {split.problem && <p className="text-sm text-destructive">{split.problem}</p>}

        {preview && (
          <p className="mx-auto w-fit rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground" data-testid="expense-preview">
            {preview}
          </p>
        )}

        {/* No confirm step: deleting shows an Undo instead. */}
        {draft.mode === "edit" && (
          <Button type="button" variant="ghost" className="w-full text-destructive" onClick={() => onDelete(draft.id)}>
            Delete expense
          </Button>
        )}
      </div>
    </form>
  );
}

function SplitPanel({
  members,
  meId,
  mode,
  onModeChange,
  includedIds,
  onToggle,
  equalShares,
  unequalTexts,
  onUnequalChange,
  totalPaise,
  remainingPaise,
  autoFill,
}: {
  members: BundleMember[];
  meId: string | null;
  mode: "equal" | "unequal";
  onModeChange: (mode: "equal" | "unequal") => void;
  includedIds: string[];
  onToggle: (id: string) => void;
  equalShares: Record<string, number> | null;
  unequalTexts: Record<string, string>;
  onUnequalChange: (id: string, text: string) => void;
  totalPaise: number | null;
  remainingPaise: number | null;
  /** Unequal: the one person whose share filled itself with what's left. */
  autoFill: { memberId: string; paise: number } | null;
}) {
  const name = (m: BundleMember) => (m.id === meId ? `${m.displayName} (you)` : m.displayName);
  let status = "";
  if (totalPaise === null) status = "Enter the total first";
  else if (remainingPaise === 0) status = `✓ All ${formatRupees(totalPaise)} assigned`;
  else if (remainingPaise !== null && remainingPaise > 0) status = `${formatRupees(remainingPaise)} left`;
  else if (remainingPaise !== null) status = `${formatRupees(-remainingPaise)} over`;

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="How to split" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {(["equal", "unequal"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onModeChange(m)}
            className={cn(
              "min-h-11 rounded-xl text-sm font-semibold",
              mode === m ? "bg-card shadow-sm dark:bg-secondary" : "text-muted-foreground",
            )}
          >
            {m === "equal" ? "Equally" : "Unequally"}
          </button>
        ))}
      </div>

      {mode === "equal" ? (
        <div className="rounded-2xl bg-card px-3" role="group" aria-label="People in it">
          {members.map((m) => {
            const on = includedIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(m.id)}
                className="flex min-h-12 w-full items-center gap-3 border-b px-1 text-left last:border-b-0"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </span>
                <Avatar id={m.id} name={m.displayName} photoUrl={m.avatarUrl} size="sm" />
                <span className="flex-1 truncate">{name(m)}</span>
                {on && equalShares?.[m.id] !== undefined && (
                  <span className="text-sm text-muted-foreground tabular-nums">{formatRupees(equalShares[m.id])}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1 rounded-2xl bg-card px-3 py-2" role="group" aria-label="Each person's share">
          {members.map((m) => {
            const text = unequalTexts[m.id] ?? "";
            const bad = parseShareText(text) === null;
            const auto = autoFill?.memberId === m.id ? autoFill.paise : null;
            return (
              <div key={m.id} className="flex min-h-12 items-center gap-3">
                <Avatar id={m.id} name={m.displayName} photoUrl={m.avatarUrl} size="sm" />
                <label htmlFor={`share-${m.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate">{name(m)}</span>
                  {auto !== null && (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground" data-testid="auto-filled">
                      auto<span className="sr-only">: filled with what&apos;s left</span>
                    </span>
                  )}
                </label>
                <div className={cn("flex w-32 items-center rounded-xl border bg-background px-2", bad && "border-destructive")}>
                  <span aria-hidden className="text-muted-foreground">
                    ₹
                  </span>
                  <input
                    id={`share-${m.id}`}
                    inputMode="decimal"
                    autoComplete="off"
                    // The filled-in share shows as the field's hint; typing replaces it and makes it manual.
                    placeholder={auto !== null ? toAmountInput(auto) : "0"}
                    value={text}
                    onChange={(e) => onUnequalChange(m.id, e.target.value)}
                    aria-invalid={bad || undefined}
                    className={cn(
                      "h-11 w-full min-w-0 bg-transparent px-1 text-right text-base tabular-nums outline-none",
                      auto !== null && "font-semibold placeholder:text-foreground",
                    )}
                  />
                </div>
              </div>
            );
          })}
          <p
            role="status"
            data-testid="split-remaining"
            className={cn(
              "pt-1 text-sm font-medium",
              remainingPaise === 0
                ? "text-positive"
                : remainingPaise !== null && remainingPaise < 0
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {status}
          </p>
        </div>
      )}
    </div>
  );
}
