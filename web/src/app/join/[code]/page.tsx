import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/user";
import { getInvitePreview } from "@/lib/data/invites";
import { getMyProfile } from "@/lib/data/profile";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join a group · Owezy" };

// Signed-out visitors never reach this page: the proxy sends them to
// /login?next=/join/<code> and sign-in brings them back.
export default function JoinPage({ params }: PageProps<"/join/[code]">) {
  return (
    <main className="flex flex-1 flex-col justify-center gap-8 px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-10">
      <Suspense fallback={<div aria-busy className="h-72 animate-pulse rounded-lg bg-muted/40" />}>
        <Join params={params} />
      </Suspense>
    </main>
  );
}

async function Join({ params }: { params: PageProps<"/join/[code]">["params"] }) {
  const { code } = await params;
  const user = await getCurrentUser();
  const [preview, profile] = await Promise.all([getInvitePreview(code), getMyProfile(user.id)]);

  if (!preview) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">This invite link isn&apos;t valid</h1>
        <p className="text-muted-foreground">Check you have the whole link, or ask for a new one.</p>
        <Button asChild variant="outline">
          <Link href="/">Go to my groups</Link>
        </Button>
      </div>
    );
  }
  if (preview.alreadyMember) redirect(`/g/${preview.groupId}`);

  return (
    <>
      <div className="space-y-1 text-center">
        <p className="text-sm text-muted-foreground">You&apos;re invited to</p>
        <h1 className="text-3xl font-semibold tracking-tight">{preview.groupName}</h1>
      </div>
      <JoinForm code={code} unclaimed={preview.unclaimed} defaultName={profile.displayName} />
    </>
  );
}
