import { NextResponse, type NextRequest } from "next/server";
import { homePath } from "@/lib/data/home";
import { createClient } from "@/lib/supabase/server";

/**
 * "/" opens the app where you left off, with a real redirect (no page flash).
 * See homePath for the rule. The proxy has already sent signed-out visitors
 * to /login.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const path = userId ? await homePath(userId) : "/login";
  return NextResponse.redirect(new URL(path, request.url));
}
