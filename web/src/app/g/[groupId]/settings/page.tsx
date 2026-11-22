import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { InviteLink } from "@/components/invite-link";
import { getCurrentUser } from "@/lib/auth/user";
import { getGroupView } from "@/lib/data/groups";
import { AddMembersForm, LeaveGroup, MemberRow, RenameForm } from "./settings-forms";

export const metadata: Metadata = { title: "Group settings · Owezy" };

export default function SettingsPage({ params }: PageProps<"/g/[groupId]/settings">) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: PageProps<"/g/[groupId]/settings">["params"] }) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  const view = await getGroupView(groupId, user.id);
  if (!view) notFound();
  const { group, members } = view;

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-1 border-b bg-background/95 px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Link
          href={`/g/${group.id}`}
          className="flex min-h-11 min-w-0 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-5 shrink-0" />
          <span className="truncate">{group.name}</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-10 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <section aria-labelledby="invite-heading" className="space-y-3">
          <h2 id="invite-heading" className="font-medium">
            Invite people
          </h2>
          <InviteLink code={view.inviteCode} groupName={group.name} />
        </section>

        <RenameForm groupId={group.id} name={group.name} />

        <section aria-labelledby="members-heading" className="space-y-4">
          <h2 id="members-heading" className="font-medium">
            Members
          </h2>
          <ul className="divide-y border-y">
            {members.map((m) => (
              <MemberRow key={m.id} groupId={group.id} member={m} />
            ))}
          </ul>
          <AddMembersForm groupId={group.id} existingNames={members.map((m) => m.displayName)} />
        </section>

        <section className="mt-auto">
          <LeaveGroup groupId={group.id} groupName={group.name} />
        </section>
      </main>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-busy aria-label="Loading settings" className="animate-pulse">
      <div className="border-b px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
        <div className="h-11 w-32 rounded-md bg-muted" />
      </div>
      <div className="space-y-10 px-4 py-6">
        <div className="h-8 w-28 rounded bg-muted" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="h-11 rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
