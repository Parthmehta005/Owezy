"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { addNames } from "@/core/names";
import { getCurrentUser } from "@/lib/auth/user";
import { homePath } from "@/lib/data/home";
import { createClient } from "@/lib/supabase/server";

/** Result shown next to a settings form. */
export interface SettingsState {
  error?: string;
  ok?: string;
}

const field = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Rename the group. RLS lets any member do it; the table checks the length. */
export async function renameGroup(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const groupId = field(form, "group_id");
  const name = field(form, "name").trim();
  if (!name) return { error: "Enter a group name." };
  if (name.length > 60) return { error: "Group names can be at most 60 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("groups").update({ name }).eq("id", groupId).select("id");
  if (error || !data?.length) return { error: "Couldn't rename the group. Please try again." };
  refresh();
  return { ok: "Saved" };
}

/** Add placeholder names, checked with the same rules as the database. */
export async function addMembers(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const groupId = field(form, "group_id");
  const pending = field(form, "new_names_pending").split(/[\s,]+/);
  const names = [...form.getAll("new_names").map(String), ...pending].map((n) => n.trim()).filter(Boolean);

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("members")
    .select("display_name")
    .eq("group_id", groupId);
  if (readError || !existing?.length) return { error: "Couldn't add people. Please try again." };
  try {
    addNames(
      existing.map((m) => m.display_name),
      names,
    );
  } catch (e) {
    return { error: (e as Error).message };
  }

  // One at a time so member order follows the order typed.
  for (const name of names) {
    const { error } = await supabase.from("members").insert({ group_id: groupId, display_name: name });
    if (error) {
      refresh();
      return { error: error.code === "23505" ? `Duplicate name: ${name}` : "Couldn't add everyone. Please try again." };
    }
  }
  refresh();
  return { ok: names.length === 1 ? `Added ${names[0]}` : `Added ${names.length} people` };
}

/** Remove a placeholder. The database refuses if any expense uses them. */
export async function removeMember(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const groupId = field(form, "group_id");
  const memberId = field(form, "member_id");
  const name = field(form, "member_name");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .delete()
    .eq("id", memberId)
    .eq("group_id", groupId)
    .is("user_id", null)
    .select("id");
  if (error?.code === "23503") {
    return { error: `${name} is part of an expense, so they can't be removed.` };
  }
  if (error || !data?.length) return { error: `Couldn't remove ${name}. Please try again.` };
  refresh();
  return { ok: `Removed ${name}` };
}

/**
 * Leave the group: your member row becomes a placeholder again, so expense
 * history stays intact and someone could claim the name later.
 */
export async function leaveGroup(form: FormData): Promise<void> {
  const groupId = field(form, "group_id");
  const user = await getCurrentUser();
  const supabase = await createClient();
  await supabase.from("members").update({ user_id: null }).eq("group_id", groupId).eq("user_id", user.id);
  // Go straight to the next home: redirecting to "/" (a route handler that
  // redirects again) doesn't complete from a client-side navigation.
  redirect(await homePath(user.id));
}
