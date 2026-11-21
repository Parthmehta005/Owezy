"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "cn";

/**
 * Type names; Space, Enter or comma turns each into a chip. Backspace on an
 * empty box removes the last chip. Chips are submitted as repeated hidden
 * inputs named `name`. Whatever is still typed in the box is submitted too
 * (as `${name}_pending`), so a name typed but not "chipped" isn't lost.
 */
export function NameChipsInput({
  id,
  name,
  names,
  onNamesChange,
  invalid,
  maxLength = 40,
  placeholder,
  describedBy,
}: {
  id: string;
  name: string;
  names: string[];
  onNamesChange: (names: string[]) => void;
  invalid?: boolean;
  maxLength?: number;
  placeholder?: string;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const parts = text.split(/[\s,]+/).filter(Boolean);
    if (parts.length) onNamesChange([...names, ...parts]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      } else if (e.key !== "Enter") {
        e.preventDefault(); // ignore a leading space/comma; Enter on empty submits the form
      }
    } else if (e.key === "Backspace" && draft === "" && names.length) {
      onNamesChange(names.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        // Also override the focus colours: the error shows while typing, i.e. while focused.
        invalid &&
          "border-destructive ring-3 ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20 dark:ring-destructive/40 dark:focus-within:ring-destructive/40",
      )}
    >
      {names.map((n, i) => (
        <span key={`${n}-${i}`} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-sm">
          {n}
          <input type="hidden" name={name} value={n} />
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={() => onNamesChange(names.filter((_, j) => j !== i))}
          >
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">Remove {n}</span>
          </button>
        </span>
      ))}
      <input
        id={id}
        name={`${name}_pending`}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => {
          // Pasting "Rahul, Neha" splits into chips straight away.
          const value = e.target.value;
          if (/[\s,]/.test(value.trim())) commit(value);
          else setDraft(value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={names.length ? "" : placeholder}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoCapitalize="words"
        className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  );
}
