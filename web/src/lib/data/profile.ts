import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface MyProfile {
  displayName: string;
  lastGroupId: string | null;
}

/** The signed-in user's profile (created by the sign-up trigger). */
export async function getMyProfile(userId: string): Promise<MyProfile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, last_group_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return { displayName: data?.display_name ?? "", lastGroupId: data?.last_group_id ?? null };
}
