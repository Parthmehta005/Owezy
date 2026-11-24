"use client";

import { Avatar } from "@/components/avatar";
import { useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "cn";
import { addDays, dateLabel } from "@/core/dates";
import { expenseEffect } from "@/core/effect";
import { formatRupees, parseAmount, toAmountInput } from "@/core/money";
import { buildShares } from "@/core/splits";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BundleExpense, BundleMember } from "@/lib/data/bundle";
import type { NewExpense } from "@/lib/data/expense-mutations";

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

type Panel = "payer" | "split" | null;

export function ExpenseSheet({
  open,
  onOpenChange,
  draft,
  members,
  meId,
  today,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ExpenseDraft;
  members: BundleMember[];
  meId: string | null;
  today: string;
  onSave: (expense: NewExpense, draft: ExpenseDraft) => void;
  /** Edit mode only. */
  onDelete: (expenseId: string) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent
        className="h-[calc(100dvh-0.75rem-env(safe-area-inset-top))] data-[vaul-drawer-direction=bottom]:max-h-none"
        // Start on the amount (not the Cancel button), so the number pad is up.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById("amount")?.focus();
        }}
      >
        {/* Remount per draft so a retry starts from what was typed. */}
        <ExpenseForm key={`${draft.id}:${draft.attempt ?? 0}`} draft={draft} members={members} meId={meId} today={today}
          onCancel={() => onOpenChange(false)} onSave={onSave} onDelete={onDelete} />
      </DrawerContent>
    </Drawer>
  );
}

function ExpenseForm({
  draft,
  members,
  meId,
  today,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: ExpenseDraft;
  members: BundleMember[];
  meId: string | null;
  today: string;
  onCancel: () => void;
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
  const [panel, setPanel] = useState<Panel>(null);
  const [submitted, setSubmitted] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const total = tryParse(amountText);
  // Keep member order (it decides who gets leftover paise in an equal split).
  const included = members.map((m) => m.id).filter((id) => includedIds.includes(id));
  const split =
    splitMode === "equal"
      ? buildShares({ mode: "equal", totalPaise: total, memberIds: included })
      : buildShares({
          mode: "unequal",
          totalPaise: total,
          amounts: Object.fromEntries(members.map((m) => [m.id, parseShareText(unequalTexts[m.id] ?? "")])),
        });
  const shares = split.shares;
  const canSave = Boolean(total && shares && description.trim()) && !submitted;
  const splitLabel =
    splitMode === "unequal"
      ? "Unequally"
      : included.length === members.length
        ? `Equally, all ${members.length}`
        : `Equally, ${included.length} ${included.length === 1 ? "person" : "people"}`;
  const payer = members.find((m) => m.id === payerId);
  const payerLabel = payerId === meId ? "You" : (payer?.displayName ?? "Choose");

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
      <div className="flex items-center justify-between gap-2 border-b px-2 pb-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <DrawerTitle className="text-base font-semibold">{draft.mode === "edit" ? "Edit expense" : "Add expense"}</DrawerTitle>
        <Button type="submit" disabled={!canSave}>
          Save
        </Button>
      </div>
      <DrawerDescription className="sr-only">Enter the amount, what it was for, who paid and the date.</DrawerDescription>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {draft.error && (
          <p role="alert" className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            {draft.error}
          </p>
        )}

        <div className="flex items-baseline gap-1 border-b pb-1 focus-within:border-primary">
          <span aria-hidden className="text-3xl text-muted-foreground">
            ₹
          </span>
          <Label htmlFor="amount" className="sr-only">
            Amount in rupees
          </Label>
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
            className="h-14 w-full min-w-0 bg-transparent text-4xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        {amountText.trim() !== "" && !total && (
          <p className="-mt-3 text-sm text-destructive">Enter an amount like 450 or 99.50</p>
        )}

        <div className="space-y-2">
          <Label htmlFor="description">What was it for?</Label>
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
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip label="Paid by" value={payerLabel} open={panel === "payer"} onClick={() => setPanel(panel === "payer" ? null : "payer")} />
          <Chip label="Split" value={splitLabel} open={panel === "split"} onClick={() => setPanel(panel === "split" ? null : "split")} />
          <label className="relative flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm focus-within:ring-3 focus-within:ring-ring/50">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{dateLabel(date, today)}</span>
            <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
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

        {panel === "payer" && (
          <fieldset className="rounded-lg border">
            <legend className="sr-only">Who paid?</legend>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={m.id === payerId}
                onClick={() => {
                  setPayerId(m.id);
                  setPanel(null);
                }}
                className="flex min-h-12 w-full items-center gap-3 border-b px-4 text-left last:border-b-0"
              >
                <Avatar id={m.id} name={m.displayName} photoUrl={m.avatarUrl} size="sm" />
                <span className="flex-1">{m.id === meId ? `${m.displayName} (you)` : m.displayName}</span>
                {m.id === payerId && <Check aria-hidden className="size-4 text-primary" />}
              </button>
            ))}
          </fieldset>
        )}

        {panel === "split" && (
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
          />
        )}
        {split.problem && <p className="text-sm text-destructive">{split.problem}</p>}

        {preview && (
          <p className="text-sm text-muted-foreground" data-testid="expense-preview">
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

function Chip({ label, value, open, onClick }: { label: string; value: string; open?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-expanded={onClick ? open : undefined}
      className={cn(
        "flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm disabled:opacity-100",
        open && "border-primary",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
      {onClick && <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />}
    </button>
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
}) {
  const name = (m: BundleMember) => (m.id === meId ? `${m.displayName} (you)` : m.displayName);
  let status = "";
  if (totalPaise === null) status = "Enter the total first";
  else if (remainingPaise === 0) status = `✓ All ${formatRupees(totalPaise)} assigned`;
  else if (remainingPaise !== null && remainingPaise > 0) status = `${formatRupees(remainingPaise)} left`;
  else if (remainingPaise !== null) status = `${formatRupees(-remainingPaise)} over`;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div role="radiogroup" aria-label="How to split" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(["equal", "unequal"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onModeChange(m)}
            className={cn("min-h-11 rounded-md text-sm font-medium", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {m === "equal" ? "Equally" : "Unequally"}
          </button>
        ))}
      </div>

      {mode === "equal" ? (
        <div>
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
        <div className="space-y-2">
          {members.map((m) => {
            const text = unequalTexts[m.id] ?? "";
            const bad = parseShareText(text) === null;
            return (
              <div key={m.id} className="flex min-h-12 items-center gap-3">
                <label htmlFor={`share-${m.id}`} className="flex-1 truncate">
                  {name(m)}
                </label>
                <div className={cn("flex w-32 items-center rounded-lg border px-2", bad && "border-destructive")}>
                  <span aria-hidden className="text-muted-foreground">
                    ₹
                  </span>
                  <input
                    id={`share-${m.id}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={text}
                    onChange={(e) => onUnequalChange(m.id, e.target.value)}
                    aria-invalid={bad || undefined}
                    className="h-11 w-full min-w-0 bg-transparent px-1 text-right text-base tabular-nums outline-none"
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
