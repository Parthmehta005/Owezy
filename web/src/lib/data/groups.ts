import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface GroupSummary {
  id: string;
  name: string;
}

export interface GroupMember {
  id: string;
  displayName: string;
  /** True when this placeholder has not been claimed by a signed-in person yet. */
  isPlaceholder: boolean;
  isMe: boolean;
  avatarUrl: string | null;
}

export interface GroupView {
  group: GroupSummary;
  /** Secret part of the /join/<code> link; members can see and share it. */
  inviteCode: string;
  /** In member order (the order equal-split leftovers follow). */
  members: GroupMember[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A group and its members, or null if it doesn't exist or the signed-in user
 * isn't in it. RLS makes those two cases indistinguishable, on purpose.
 */
export async function getGroupView(groupId: string, userId: string): Promise<GroupView | null> {
  if (!UUID.test(groupId)) return null;
  const supabase = await createClient();
  const [groupResult, membersResult] = await Promise.all([
    supabase.from("groups").select("id, name, invite_code").eq("id", groupId).maybeSingle(),
    supabase.from("members").select("id, display_name, user_id, avatar_url").eq("group_id", groupId).order("sort_order"),
  ]);
  if (groupResult.error) throw groupResult.error;
  if (membersResult.error) throw membersResult.error;
  if (!groupResult.data) return null;

  return {
    group: { id: groupResult.data.id, name: groupResult.data.name },
    inviteCode: groupResult.data.invite_code,
    members: membersResult.data.map((m) => ({
      id: m.id,
      displayName: m.display_name,
      isPlaceholder: m.user_id === null,
      isMe: m.user_id === userId,
      avatarUrl: m.avatar_url,
    })),
  };
}

/** Every group the signed-in user is in, by name. */
export async function listMyGroups(): Promise<GroupSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("groups").select("id, name").order("name");
  if (error) throw error;
  return data;
}
