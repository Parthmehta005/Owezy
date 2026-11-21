import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google and email sign-in links land. Supabase adds ?code=..., which
 * is exchanged for a session (stored in cookies) using the PKCE verifier the
 * browser saved when sign-in started. Then the person goes on to ?next.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));

  const failed = (reason: string) => {
    const url = new URL("/login", origin);
    url.searchParams.set("error", reason);
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  // e.g. the person cancelled on Google's screen.
  if (searchParams.get("error")) return failed("cancelled");

  const code = searchParams.get("code");
  if (!code) return failed("missing_code");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  // Most often: an email link opened in a different browser from the one
  // that requested it, so there is no PKCE verifier cookie here.
  if (error) return failed("link_invalid");

  return NextResponse.redirect(new URL(next, origin));
}
