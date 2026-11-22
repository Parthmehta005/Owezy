"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "cn";
import { addDays, dateLabel } from "@/core/dates";
import { expenseEffect } from "@/core/effect";
import { formatInr, parseAmount } from "@/core/money";
import { splitEqual } from "@/core/splits";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BundleMember } from "@/lib/data/bundle";
import type { NewExpense } from "@/lib/data/expense-mutations";

/** What the sheet starts from: a fresh expense, or one whose save failed. */
export interface ExpenseDraft {
  /** Stays the same across retries, so the server can't create a duplicate. */
  id: string;
  amountText: string;
  description: string;
  payerId: string;
  date: string;
  /** Why the last save failed, if it did. */
  error?: string;
  /** Failed attempts so far. Each failure remounts the form so Save works again,
   * even if the error message is the same as last time. */
  attempt?: number;
}

export function newDraft(payerId: string, today: string): ExpenseDraft {
  return { id: crypto.randomUUID(), amountText: "", description: "", payerId, date: today };
}

function tryParse(text: string) {
  try {
    return parseAmount(text);
  } catch {
    return null;
  }
}

type Panel = "payer" | null;

export function ExpenseSheet({
  open,
  onOpenChange,
  draft,
  members,
  meId,
  today,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ExpenseDraft;
  members: BundleMember[];
  meId: string | null;
  today: string;
  onSave: (expense: NewExpense, draft: ExpenseDraft) => void;
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
          onCancel={() => onOpenChange(false)} onSave={onSave} />
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
}: {
  draft: ExpenseDraft;
  members: BundleMember[];
  meId: string | null;
  today: string;
  onCancel: () => void;
  onSave: (expense: NewExpense, draft: ExpenseDraft) => void;
}) {
  const [amountText, setAmountText] = useState(draft.amountText);
  const [description, setDescription] = useState(draft.description);
  const [payerId, setPayerId] = useState(draft.payerId);
  const [date, setDate] = useState(draft.date);
  const [panel, setPanel] = useState<Panel>(null);
  const [submitted, setSubmitted] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const total = tryParse(amountText);
  const memberIds = members.map((m) => m.id);
  const shares = total ? splitEqual(total, memberIds) : null;
  const canSave = Boolean(total && shares && description.trim()) && !submitted;
  const payer = members.find((m) => m.id === payerId);
  const payerLabel = payerId === meId ? "You" : (payer?.displayName ?? "Choose");

  function save(event?: FormEvent) {
    event?.preventDefault();
    if (!canSave || !total || !shares) return;
    setSubmitted(true); // a second tap before the sheet closes does nothing
    onSave(
      { id: draft.id, description: description.trim(), payerId, totalPaise: total, splitType: "equal", shares, date },
      { ...draft, amountText, description, payerId, date, error: undefined },
    );
  }

  let preview = "";
  if (total && shares && meId) {
    const effect = expenseEffect({ payerId, totalPaise: total, shares }, meId);
    preview =
      effect.kind === "lent"
        ? `You get back ${formatInr(effect.amountPaise)}`
        : effect.kind === "borrowed"
          ? `You owe ${formatInr(effect.amountPaise)}`
          : "No change to your balance";
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      {/* Actions at the top: the on-screen keyboard covers the bottom half of the screen. */}
      <div className="flex items-center justify-between gap-2 border-b px-2 pb-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <DrawerTitle className="text-base font-semibold">Add expense</DrawerTitle>
        <Button type="submit" disabled={!canSave}>
          Save
        </Button>
      </div>
      <DrawerDescription className="sr-only">Enter the amount, what it was for, who paid and the date.</DrawerDescription>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {draft.error && (
          <p role="alert" className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
            Not saved: {draft.error} Your details are below; tap Save to try again.
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
          <Chip label="Split" value={`Equally, all ${members.length}`} />
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
              className="absolute inset-0 cursor-pointer opacity-0"
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
                className="flex min-h-12 w-full items-center justify-between border-b px-4 text-left last:border-b-0"
              >
                <span>{m.id === meId ? `${m.displayName} (you)` : m.displayName}</span>
                {m.id === payerId && <Check aria-hidden className="size-4 text-primary" />}
              </button>
            ))}
          </fieldset>
        )}

        {preview && (
          <p className="text-sm text-muted-foreground" data-testid="expense-preview">
            {preview}
          </p>
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
