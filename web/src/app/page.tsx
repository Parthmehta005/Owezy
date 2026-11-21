import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/user";
import { signOut } from "./auth/actions";

// Temporary home until the "/ opens your last group" task replaces it.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Owezy</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <SignedIn />
      </Suspense>
    </main>
  );
}

async function SignedIn() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.email ?? "you"}</span>
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
