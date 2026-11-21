import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/user";
import { getMyProfile } from "@/lib/data/profile";
import { NewGroupForm } from "./new-group-form";

export const metadata: Metadata = { title: "New group · Owezy" };

export default function NewGroupPage() {
  return (
    <main className="flex flex-1 flex-col gap-8 px-4 py-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New group</h1>
        <p className="text-muted-foreground">Name it, add the people, and start splitting.</p>
      </div>
      <Suspense fallback={<div className="h-80" />}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  const user = await getCurrentUser();
  const profile = await getMyProfile(user.id);
  return <NewGroupForm defaultMyName={profile.displayName} />;
}
