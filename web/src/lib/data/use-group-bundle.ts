"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchGroupBundle, groupKeys, type GroupBundle } from "./bundle";

/**
 * The group bundle, starting from what the server rendered (so there's no
 * loading state on open) and refreshed in the background.
 *
 * refetchOnWindowFocus "always": coming back to the app (switching tabs, or
 * reopening the installed app, which fires visibilitychange) always
 * re-checks, regardless of how recently it loaded. Until live updates exist,
 * this is how you see a friend's new expense.
 */
export function useGroupBundle(groupId: string, userId: string, initial: GroupBundle, initialAt: number) {
  return useQuery({
    queryKey: groupKeys.bundle(groupId),
    queryFn: () => fetchGroupBundle(createClient(), groupId, userId),
    initialData: initial,
    initialDataUpdatedAt: initialAt,
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
    // Supabase's client already retries reads on network errors (3 times over
    // about 7s). Retrying again here would make a lost connection take 30s+
    // to show "Couldn't refresh".
    retry: false,
  });
}
