import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * "/" opens the app where you left off, with a real redirect (no page flash):
 * your last group if you're still in it, otherwise any group you're in,
 * otherwise "New group". The proxy has already sent signed-out visitors to
 * /login.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return to("/login");

  const { data: profile } = await supabase.from("profiles").select("last_group_id").eq("id", userId).maybeSingle();
  if (profile?.last_group_id) {
    // RLS returns the group only if the user is still a member.
    const { data: last } = await supabase.from("groups").select("id").eq("id", profile.last_group_id).maybeSingle();
    if (last) return to(`/g/${last.id}`);
  }

  const { data: any } = await supabase.from("groups").select("id").order("name").limit(1).maybeSingle();
  return to(any ? `/g/${any.id}` : "/new");
}
