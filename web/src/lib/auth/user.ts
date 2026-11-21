import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string | undefined;
}

/**
 * The signed-in user, verified from the session JWT. Redirects to /login if
 * there is none (the proxy normally does that first). Reads cookies, so call
 * it from a component inside a <Suspense> boundary.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
}
