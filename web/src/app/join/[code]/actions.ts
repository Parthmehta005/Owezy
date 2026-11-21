"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface JoinState {
  error?: string;
}

/**
 * Join through an invite, either claiming a placeholder (claim_member_id) or
 * as a new member (new_name). join_group checks everything, including that a
 * name can only be claimed once, even by two people at the same moment.
 */
export async function joinGroup(_prev: JoinState, form: FormData): Promise<JoinState> {
  const code = String(form.get("code") ?? "");
  const claim = form.get("claim_member_id");
  const newName = form.get("new_name");

  const supabase = await createClient();
  const { data: groupId, error } = await supabase.rpc("join_group", {
    code,
    claim_member_id: claim ? String(claim) : undefined,
    new_name: claim ? undefined : String(newName ?? ""),
  });
  if (error) {
    // Someone else may have just claimed the name: show the updated list.
    refresh();
    const userFacing = ["22023", "23505", "P0002"].includes(error.code);
    return { error: userFacing ? error.message : "Couldn't join the group. Please try again." };
  }
  redirect(`/g/${groupId}`);
}
