"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Records the open group as the user's last group, so "/" brings them back
 * here next time. RLS only accepts a group the user is in. Best effort: a
 * failure here just means "/" picks a different group.
 */
export function RememberLastGroup({ userId, groupId }: { userId: string; groupId: string }) {
  useEffect(() => {
    // Supabase queries are lazy: nothing is sent until the builder is awaited
    // or .then() is called, so `void query` alone would silently do nothing.
    createClient()
      .from("profiles")
      .update({ last_group_id: groupId })
      .eq("id", userId)
      .then(() => undefined);
  }, [userId, groupId]);
  return null;
}
