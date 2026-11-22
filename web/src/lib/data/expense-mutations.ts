"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import type { Paise } from "@/core/money";
import type { Shares } from "@/core/types";
import { createClient } from "@/lib/supabase/client";
import { groupKeys, type BundleExpense, type GroupBundle } from "./bundle";

export interface NewExpense {
  /** Generated on the phone when the sheet opens; a retry reuses it, so it can't duplicate. */
  id: string;
  description: string;
  payerId: string;
  totalPaise: Paise;
  splitType: "equal" | "unequal";
  shares: Shares;
  /** "YYYY-MM-DD" */
  date: string;
}

/** Newest date first, then newest added first: the order the list shows. */
function byListOrder(a: BundleExpense, b: BundleExpense) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

/** A message for the person, from a failed Supabase call. */
export function saveErrorMessage(error: unknown): string {
  const e = error as Partial<PostgrestError> | undefined;
  // Validation messages from the database are written for people.
  if (e?.code && ["22023", "23505", "42501", "P0002", "PT409"].includes(e.code) && e.message) return e.message;
  // No code at all: the request never reached the server.
  if (!e?.code) return "Couldn't reach Owezy. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

/**
 * Add an expense optimistically: it appears in the list at once (marked
 * pending) and is removed again if the save fails. The list is refetched
 * afterwards either way, so it ends up matching the server.
 */
export function useCreateExpense(groupId: string) {
  const queryClient = useQueryClient();
  const key = groupKeys.bundle(groupId);

  return useMutation({
    mutationFn: async (input: NewExpense) => {
      const { data, error } = await createClient().rpc("create_expense", {
        group_id: groupId,
        description: input.description,
        payer_member_id: input.payerId,
        total_paise: input.totalPaise,
        split_type: input.splitType,
        shares: input.shares,
        expense_id: input.id,
        expense_date: input.date,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const optimistic: BundleExpense = {
        id: input.id,
        description: input.description.trim(),
        payerId: input.payerId,
        totalPaise: input.totalPaise,
        splitType: input.splitType,
        date: input.date,
        createdAt: new Date().toISOString(),
        version: 1,
        shares: input.shares,
        pending: true,
      };
      queryClient.setQueryData<GroupBundle | null>(key, (bundle) =>
        bundle
          ? { ...bundle, expenses: [optimistic, ...bundle.expenses.filter((e) => e.id !== input.id)].sort(byListOrder) }
          : bundle,
      );
    },
    onError: (_error, input) => {
      // Remove just this expense, leaving anything else that changed meanwhile.
      queryClient.setQueryData<GroupBundle | null>(key, (bundle) =>
        bundle ? { ...bundle, expenses: bundle.expenses.filter((e) => e.id !== input.id) } : bundle,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export interface ExpenseEdit extends NewExpense {
  /** The version the edit was based on; the server rejects it (PT409) if someone changed it since. */
  expectedVersion: number;
}

/** True when a save failed because someone else changed the expense first. */
export function isConflict(error: unknown) {
  return (error as Partial<PostgrestError> | undefined)?.code === "PT409";
}

/** True when the expense no longer exists (someone deleted it). */
export function isGone(error: unknown) {
  return (error as Partial<PostgrestError> | undefined)?.code === "P0002";
}

/**
 * Edit an expense optimistically: the row updates at once (marked pending)
 * and goes back to how it was if the save fails. Refetched afterwards.
 */
export function useUpdateExpense(groupId: string) {
  const queryClient = useQueryClient();
  const key = groupKeys.bundle(groupId);

  return useMutation({
    mutationFn: async (input: ExpenseEdit) => {
      const { data, error } = await createClient().rpc("update_expense", {
        expense_id: input.id,
        expected_version: input.expectedVersion,
        description: input.description,
        payer_member_id: input.payerId,
        total_paise: input.totalPaise,
        split_type: input.splitType,
        shares: input.shares,
        expense_date: input.date,
      });
      if (error) throw error;
      return data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GroupBundle | null>(key)?.expenses.find((e) => e.id === input.id);
      queryClient.setQueryData<GroupBundle | null>(key, (bundle) =>
        bundle
          ? {
              ...bundle,
              expenses: bundle.expenses
                .map((e) =>
                  e.id === input.id
                    ? {
                        ...e,
                        description: input.description.trim(),
                        payerId: input.payerId,
                        totalPaise: input.totalPaise,
                        splitType: input.splitType,
                        shares: input.shares,
                        date: input.date,
                        pending: true,
                      }
                    : e,
                )
                .sort(byListOrder),
            }
          : bundle,
      );
      return { previous };
    },
    onError: (_error, input, context) => {
      const previous = context?.previous;
      if (!previous) return;
      queryClient.setQueryData<GroupBundle | null>(key, (bundle) =>
        bundle ? { ...bundle, expenses: bundle.expenses.map((e) => (e.id === input.id ? previous : e)).sort(byListOrder) } : bundle,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
