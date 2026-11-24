import "server-only";
import { rankByFrecency } from "@/core/frecency";
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

/**
 * Every group the signed-in user is in, the one they use most (weighted to
 * recent use) first. See core/frecency.ts.
 */
export async function listMyGroups(userId: string): Promise<GroupSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("open_score, opened_at, groups(id, name)")
    .eq("user_id", userId);
  if (error) throw error;
  const entries = data.flatMap((m) =>
    m.groups ? [{ id: m.groups.id, name: m.groups.name, score: m.open_score, openedAt: m.opened_at ? new Date(m.opened_at) : null }] : [],
  );
  return rankByFrecency(entries, new Date()).map(({ id, name }) => ({ id, name }));
}
