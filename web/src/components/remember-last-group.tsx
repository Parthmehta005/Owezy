"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Counts this visit towards the group's "frecency" score, which decides the
 * group "/" opens (see core/frecency.ts and public.record_group_open). Best
 * effort: a failure only means this visit isn't counted.
 */
export function RememberLastGroup({ groupId }: { groupId: string }) {
  useEffect(() => {
    // Supabase queries are lazy: nothing is sent until the builder is awaited
    // or .then() is called, so `void query` alone would silently do nothing.
    createClient()
      .rpc("record_group_open", { group_id: groupId })
      .then(() => undefined);
  }, [groupId]);
  return null;
}
