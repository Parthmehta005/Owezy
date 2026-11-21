import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isPublicPath, safeNextPath } from "@/lib/auth/next-path";
import type { Database } from "@/lib/supabase/types";

/**
 * Runs before every page request:
 * 1. Refreshes the Supabase session so its cookies stay valid. Refreshed
 *    cookies are written to both the request (so this render sees them) and
 *    the response (so the browser keeps them), together with the no-cache
 *    headers Supabase asks for, so a CDN never serves one person's session
 *    cookie to someone else.
 * 2. Optimistic routing only: signed-out visitors go to /login?next=<page>,
 *    and signed-in visitors on /login go on to their destination. Real
 *    authorisation is Row Level Security in the database, not this file.
 */
export async function proxy(request: NextRequest) {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();
  let response = NextResponse.next({ request });
  const responseHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        Object.assign(responseHeaders, headers);
      },
    },
  });

  // Verifies the JWT (and refreshes it if expired). Do not run code between
  // creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  let redirectTo: URL | undefined;
  if (!signedIn && !isPublicPath(pathname)) {
    redirectTo = new URL("/login", request.url);
    if (pathname !== "/") redirectTo.searchParams.set("next", pathname + search);
  } else if (signedIn && pathname === "/login") {
    redirectTo = new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url);
  }

  if (redirectTo) {
    const redirect = NextResponse.redirect(redirectTo);
    // Keep any refreshed session cookies on the redirect too.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    response = redirect;
  }
  for (const [key, value] of Object.entries(responseHeaders)) response.headers.set(key, value);
  return response;
}

export const config = {
  // Every page, but not static files, images or the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|webmanifest)$).*)"],
};
