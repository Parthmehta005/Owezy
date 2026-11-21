import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Where "home" is for a signed-in user: their last group if they're still in
 * it, otherwise any group they're in, otherwise "New group".
 */
export async function homePath(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("last_group_id").eq("id", userId).maybeSingle();
  if (profile?.last_group_id) {
    // RLS returns the group only if the user is still a member.
    const { data: last } = await supabase.from("groups").select("id").eq("id", profile.last_group_id).maybeSingle();
    if (last) return `/g/${last.id}`;
  }
  const { data: any } = await supabase.from("groups").select("id").order("name").limit(1).maybeSingle();
  return any ? `/g/${any.id}` : "/new";
}
