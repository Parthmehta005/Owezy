import Link from "next/link";
import { Suspense } from "react";
import { Settings } from "lucide-react";
import { notFound } from "next/navigation";
import { GroupSwitcher } from "@/components/group-switcher";
import { RememberLastGroup } from "@/components/remember-last-group";
import { getCurrentUser } from "@/lib/auth/user";
import { getGroupView, listMyGroups, type GroupMember } from "@/lib/data/groups";

export default function GroupPage({ params }: PageProps<"/g/[groupId]">) {
  // The group id and session are request-time data, so everything below
  // streams in behind this boundary while the skeleton shows.
  return (
    <Suspense fallback={<GroupSkeleton />}>
      <GroupScreen params={params} />
    </Suspense>
  );
}

async function GroupScreen({ params }: { params: PageProps<"/g/[groupId]">["params"] }) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  const [view, groups] = await Promise.all([getGroupView(groupId, user.id), listMyGroups()]);
  if (!view) notFound();

  return (
    <>
      <RememberLastGroup userId={user.id} groupId={view.group.id} />
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 backdrop-blur">
        <GroupSwitcher current={view.group} groups={groups} />
        <Link
          href={`/g/${view.group.id}/settings`}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings aria-hidden className="size-5" />
          <span className="sr-only">Group settings</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-8 px-4 py-6">
        <Members members={view.members} />
        <section aria-labelledby="expenses-heading" className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <h2 id="expenses-heading" className="text-lg font-medium">
            No expenses yet
          </h2>
          <p className="max-w-xs text-sm text-muted-foreground">Expenses added to this group will show up here.</p>
        </section>
      </main>
    </>
  );
}

function Members({ members }: { members: GroupMember[] }) {
  return (
    <section aria-labelledby="members-heading" className="space-y-3">
      <h2 id="members-heading" className="text-sm font-medium text-muted-foreground">
        {members.length} {members.length === 1 ? "member" : "members"}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {members.map((m) => (
          <li
            key={m.id}
            className={
              m.isPlaceholder
                ? "rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground"
                : "rounded-full bg-muted px-3 py-1 text-sm"
            }
          >
            {m.displayName}
            {m.isMe && <span className="text-muted-foreground"> (you)</span>}
            {m.isPlaceholder && <span className="sr-only"> (not joined yet)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GroupSkeleton() {
  return (
    <div aria-busy className="animate-pulse">
      <div className="flex items-center border-b px-4 py-3">
        <div className="h-7 w-40 rounded-md bg-muted" />
      </div>
      <div className="flex gap-2 px-4 py-6">
        <div className="h-7 w-20 rounded-full bg-muted" />
        <div className="h-7 w-16 rounded-full bg-muted" />
        <div className="h-7 w-24 rounded-full bg-muted" />
      </div>
    </div>
  );
}
