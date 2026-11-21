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
    <main className="flex flex-1 flex-col gap-8 px-4 py-8">
      <div className="space-y-1">
        <Link href="/" className="-ml-1 inline-block rounded px-1 text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New group</h1>
        <p className="text-muted-foreground">Name it, add the people, and start splitting.</p>
      </div>
      <Suspense fallback={<div className="h-80" />}>
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
