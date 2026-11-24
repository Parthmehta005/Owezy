import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/user";
import { getMyProfile } from "@/lib/data/profile";
import { NewGroupForm } from "./new-group-form";

export const metadata: Metadata = { title: "New group · Owezy" };

export default function NewGroupPage() {
  return (
    <main className="flex flex-1 flex-col gap-8 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-8">
      <div className="space-y-1">
        <Link href="/" className="-ml-2 inline-flex min-h-11 items-center rounded px-2 text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight">New group</h1>
        <p className="text-muted-foreground">Name it, add the people, and start splitting.</p>
      </div>
      <Suspense
        fallback={
          <div aria-busy aria-label="Loading" className="h-80 animate-pulse space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-11 rounded-md bg-muted" />
              </div>
            ))}
          </div>
        }
      >
        <Form />
      </Suspense>
      {/* Someone with no groups lands here, so they need a way out. */}
      <form action={signOut} className="mt-auto text-center">
        <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
          Sign out
        </Button>
      </form>
    </main>
  );
}

async function Form() {
  const user = await getCurrentUser();
  const profile = await getMyProfile(user.id);
  return <NewGroupForm defaultMyName={profile.displayName} />;
}
