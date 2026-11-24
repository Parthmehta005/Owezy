import { Suspense } from "react";
import { notFound } from "next/navigation";
import { RememberLastGroup } from "@/components/remember-last-group";
import { getCurrentUser } from "@/lib/auth/user";
import { fetchGroupBundle } from "@/lib/data/bundle";
import { listMyGroups } from "@/lib/data/groups";
import { createClient } from "@/lib/supabase/server";
import { GroupScreen } from "./group-screen";

export default function GroupPage({ params }: PageProps<"/g/[groupId]">) {
  // The group id and session are request-time data, so everything below
  // streams in behind this boundary while the skeleton shows.
  return (
    <Suspense fallback={<GroupSkeleton />}>
      <Group params={params} />
    </Suspense>
  );
}

async function Group({ params }: { params: PageProps<"/g/[groupId]">["params"] }) {
  const { groupId } = await params;
  const user = await getCurrentUser();
  const [{ bundle, loadedAt }, groups] = await Promise.all([loadBundle(groupId, user.id), listMyGroups(user.id)]);
  if (!bundle) notFound();

  // The server's copy seeds the browser cache, which then keeps it fresh.
  return (
    <>
      <RememberLastGroup groupId={bundle.group.id} />
      <GroupScreen groupId={groupId} userId={user.id} initial={bundle} initialAt={loadedAt} groups={groups} />
    </>
  );
}

/** The bundle plus when it was loaded, so the browser knows how fresh it is. */
async function loadBundle(groupId: string, userId: string) {
  const bundle = await fetchGroupBundle(await createClient(), groupId, userId);
  return { bundle, loadedAt: Date.now() };
}

function GroupSkeleton() {
  return (
    <div aria-busy aria-label="Loading group" className="animate-pulse">
      <div className="flex items-center border-b px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
        <div className="h-11 w-40 rounded-md bg-muted" />
      </div>
      <div className="space-y-8 px-4 pt-6">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-9 w-44 rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-20 rounded-full bg-muted" />
          <div className="h-7 w-16 rounded-full bg-muted" />
          <div className="h-7 w-24 rounded-full bg-muted" />
        </div>
        <div className="h-12 rounded-lg bg-muted" />
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-36 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
              </div>
              <div className="h-5 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
