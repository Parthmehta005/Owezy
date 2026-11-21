"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CreateGroupState {
  error?: string;
}

/**
 * Create a group through the create_group RPC, which re-checks every rule
 * (signed in, names trimmed, non-empty, unique ignoring case). Its error
 * messages are written for people, so they are shown as-is.
 */
export async function createGroup(_prev: CreateGroupState, form: FormData): Promise<CreateGroupState> {
  const groupName = String(form.get("group_name") ?? "");
  const myName = String(form.get("my_name") ?? "");
  const pending = String(form.get("others_pending") ?? "").split(/[\s,]+/);
  const others = [...form.getAll("others").map(String), ...pending].map((n) => n.trim()).filter(Boolean);

  const supabase = await createClient();
  const { data: groupId, error } = await supabase.rpc("create_group", {
    group_name: groupName,
    my_name: myName,
    other_names: others,
  });
  if (error) {
    // 22023 / 23505 are validation messages meant for the user; anything else isn't.
    const userFacing = error.code === "22023" || error.code === "23505";
    return { error: userFacing ? error.message : "Couldn't create the group. Please try again." };
  }
  redirect(`/g/${groupId}`);
}
