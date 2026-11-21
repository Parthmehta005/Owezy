import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const previewSchema = z.object({
  group_id: z.uuid(),
  group_name: z.string(),
  already_member: z.boolean(),
  unclaimed: z.array(z.object({ id: z.uuid(), display_name: z.string() })),
});

export interface InvitePreview {
  groupId: string;
  groupName: string;
  alreadyMember: boolean;
  unclaimed: { id: string; displayName: string }[];
}

/** What the join screen shows for an invite code, or null if the code is not valid. */
export async function getInvitePreview(code: string): Promise<InvitePreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_preview", { code });
  if (error) {
    if (error.code === "P0002") return null;
    throw error;
  }
  const p = previewSchema.parse(data);
  return {
    groupId: p.group_id,
    groupName: p.group_name,
    alreadyMember: p.already_member,
    unclaimed: p.unclaimed.map((m) => ({ id: m.id, displayName: m.display_name })),
  };
}
