import { describe, expect, it } from "vitest";
import type { ExpenseDraft } from "@/components/expense-sheet";
import { draftToResume, hasContent, loadDrafts, removeDraft, saveDraft } from "./expense-drafts";

/** An in-memory stand-in for localStorage. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const base: ExpenseDraft = { mode: "add", id: "new-1", amountText: "", description: "", payerId: "me", date: "2026-11-24", splitMode: "equal" };

describe("expense drafts", () => {
  it("keeps drafts per group until removed", () => {
    const store = memoryStorage();
    saveDraft("g1", { ...base, amountText: "1240" }, 1, store);
    saveDraft("g1", { ...base, id: "e-9", mode: "edit", version: 3, description: "Cab" }, 2, store);
    saveDraft("g2", { ...base, id: "other" }, 3, store);
    expect(Object.keys(loadDrafts("g1", store)).sort()).toEqual(["e-9", "new-1"]);
    expect(loadDrafts("g1", store)["new-1"].amountText).toBe("1240");
    removeDraft("g1", "new-1", store);
    expect(Object.keys(loadDrafts("g1", store))).toEqual(["e-9"]);
    expect(Object.keys(loadDrafts("g2", store))).toEqual(["other"]);
  });

  it("doesn't keep a failed save's error message", () => {
    const store = memoryStorage();
    saveDraft("g1", { ...base, error: "Not saved: offline" }, 1, store);
    expect(loadDrafts("g1", store)["new-1"].error).toBeUndefined();
  });

  it("resumes the new expense first, else the latest edit", () => {
    const edit = (id: string, savedAt: number) => ({ ...base, id, mode: "edit" as const, savedAt });
    expect(draftToResume({ a: edit("a", 1), b: edit("b", 5) })?.id).toBe("b");
    expect(draftToResume({ a: edit("a", 9), n: { ...base, savedAt: 1 } })?.id).toBe("new-1");
    expect(draftToResume({})).toBeNull();
  });

  it("survives broken or missing storage", () => {
    const broken = { getItem: () => "{not json", setItem: () => { throw new Error("full"); } } as unknown as Storage;
    expect(loadDrafts("g1", broken)).toEqual({});
    expect(() => saveDraft("g1", base, 1, broken)).not.toThrow();
    expect(loadDrafts("g1", null)).toEqual({});
  });

  it("knows when a new expense has something worth keeping", () => {
    expect(hasContent(base, base)).toBe(false);
    expect(hasContent({ ...base, amountText: "  " }, base)).toBe(false);
    expect(hasContent({ ...base, amountText: "50" }, base)).toBe(true);
    expect(hasContent({ ...base, splitMode: "unequal" }, base)).toBe(true);
  });
});
