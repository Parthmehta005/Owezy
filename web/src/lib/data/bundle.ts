/**
 * Everything the group screen needs, in one round of queries: the group,
 * its members (in member order) and its live expenses with their shares.
 * Works with either Supabase client, so the server can render the first
 * paint and the browser can refresh it. RLS limits it to the user's groups.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paise } from "@/core/money";
import type { Shares } from "@/core/types";
import type { Database } from "@/lib/supabase/types";

export interface BundleMember {
  id: string;
  displayName: string;
  isPlaceholder: boolean;
  isMe: boolean;
  /** Their sign-in photo, if any (fellow members only). */
  avatarUrl: string | null;
}

export interface BundleExpense {
  id: string;
  description: string;
  payerId: string;
  totalPaise: Paise;
  splitType: "equal" | "unequal";
  /** The day it happened, "YYYY-MM-DD" (a calendar date, no time zone). */
  date: string;
  createdAt: string;
  /** For stale-edit detection: pass back as expected_version. */
  version: number;
  shares: Shares;
  /** Shown before the server has confirmed it (optimistic update). Client-only. */
  pending?: boolean;
}

export interface GroupBundle {
  group: { id: string; name: string };
  members: BundleMember[];
  /** The signed-in user's member id in this group. */
  meId: string | null;
  /** Newest date first, then newest added first. Deleted expenses excluded. */
  expenses: BundleExpense[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const groupKeys = {
  bundle: (groupId: string) => ["group", groupId, "bundle"] as const,
};

/** The group bundle, or null if the group doesn't exist or the user isn't in it. */
export async function fetchGroupBundle(
  supabase: SupabaseClient<Database>,
  groupId: string,
  userId: string,
): Promise<GroupBundle | null> {
  if (!UUID.test(groupId)) return null;
  const [groupRes, membersRes, expensesRes] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", groupId).maybeSingle(),
    supabase.from("members").select("id, display_name, user_id, avatar_url").eq("group_id", groupId).order("sort_order"),
    supabase
      .from("expenses")
      .select(
        "id, description, payer_member_id, total_paise, split_type, expense_date, created_at, version, expense_shares(member_id, share_paise)",
      )
      .eq("group_id", groupId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (groupRes.error) throw groupRes.error;
  if (membersRes.error) throw membersRes.error;
  if (expensesRes.error) throw expensesRes.error;
  if (!groupRes.data) return null;

  const members = membersRes.data.map((m) => ({
    id: m.id,
    displayName: m.display_name,
    isPlaceholder: m.user_id === null,
    isMe: m.user_id === userId,
    avatarUrl: m.avatar_url,
  }));

  return {
    group: groupRes.data,
    members,
    meId: members.find((m) => m.isMe)?.id ?? null,
    expenses: expensesRes.data.map((e) => ({
      id: e.id,
      description: e.description,
      payerId: e.payer_member_id,
      totalPaise: e.total_paise,
      splitType: e.split_type === "unequal" ? "unequal" : "equal",
      date: e.expense_date,
      createdAt: e.created_at,
      version: e.version,
      shares: Object.fromEntries(e.expense_shares.map((s) => [s.member_id, s.share_paise])),
    })),
  };
}
