/**
 * Half-filled expenses kept on the phone until they're saved or discarded
 * (the owner's "minimise and come back" feature). One slot per expense id
 * within a group: at most one new expense, plus any edits in progress.
 *
 * Browser storage can be missing or throw (private mode, blocked site data),
 * so every access is guarded; the app still works, just without resuming.
 */
import { useSyncExternalStore } from "react";
import type { ExpenseDraft } from "@/components/expense-sheet";

export interface StoredDraft extends ExpenseDraft {
  /** When it was last changed (ms), to show the most recent first. */
  savedAt: number;
}

const key = (groupId: string) => `owezy:drafts:${groupId}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadDrafts(groupId: string, store: Storage | null = storage()): Record<string, StoredDraft> {
  try {
    const raw = store?.getItem(key(groupId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const CHANGED = "owezy:drafts-changed";

function write(groupId: string, drafts: Record<string, StoredDraft>, store: Storage | null) {
  try {
    if (Object.keys(drafts).length === 0) store?.removeItem(key(groupId));
    else store?.setItem(key(groupId), JSON.stringify(drafts));
  } catch {
    // Full or blocked storage: the draft just won't survive a reload.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

const EMPTY: Record<string, StoredDraft> = {};
let cache: { raw: string | null; value: Record<string, StoredDraft> } = { raw: null, value: EMPTY };

function snapshot(groupId: string): Record<string, StoredDraft> {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(key(groupId)) ?? null;
  } catch {
    raw = null;
  }
  // Same text as last time: same object, so React doesn't re-render for nothing.
  if (raw !== cache.raw) cache = { raw, value: raw ? loadDrafts(groupId) : EMPTY };
  return cache.value;
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange); // another tab
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** A group's kept drafts, live. Empty while server rendering (they only exist on the phone). */
export function useDrafts(groupId: string): Record<string, StoredDraft> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(groupId),
    () => EMPTY,
  );
}

/** Keep (or update) a draft; returns the new set. */
export function saveDraft(groupId: string, draft: ExpenseDraft, now = Date.now(), store: Storage | null = storage()) {
  // A failed save's message isn't part of the draft.
  const drafts = { ...loadDrafts(groupId, store), [draft.id]: { ...draft, error: undefined, savedAt: now } };
  write(groupId, drafts, store);
  return drafts;
}

/** Forget a draft (saved, discarded or deleted); returns the new set. */
export function removeDraft(groupId: string, draftId: string, store: Storage | null = storage()) {
  const drafts = { ...loadDrafts(groupId, store) };
  delete drafts[draftId];
  write(groupId, drafts, store);
  return drafts;
}

/** The draft the "Continue expense" bar offers: the new expense if there is one, else the latest edit. */
export function draftToResume(drafts: Record<string, StoredDraft>): StoredDraft | null {
  const all = Object.values(drafts).sort((a, b) => b.savedAt - a.savedAt);
  return all.find((d) => d.mode === "add") ?? all[0] ?? null;
}

/** Whether a new expense has anything worth keeping (or asking before throwing away). */
export function hasContent(draft: ExpenseDraft, start: ExpenseDraft): boolean {
  const pick = (d: ExpenseDraft) =>
    JSON.stringify([d.amountText.trim(), d.description.trim(), d.payerId, d.date, d.splitMode, d.includedIds ?? null, d.unequalTexts ?? {}]);
  return pick(draft) !== pick(start);
}
