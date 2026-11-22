"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { GroupSwitcher } from "@/components/group-switcher";
import { Button } from "@/components/ui/button";
import type { BundleMember, GroupBundle } from "@/lib/data/bundle";
import type { GroupSummary } from "@/lib/data/groups";
import { useGroupBundle } from "@/lib/data/use-group-bundle";

export function GroupScreen({
  groupId,
  userId,
  initial,
  initialAt,
  groups,
}: {
  groupId: string;
  userId: string;
  initial: GroupBundle;
  initialAt: number;
  groups: GroupSummary[];
}) {
  const { data: bundle } = useGroupBundle(groupId, userId, initial, initialAt);

  // A refresh found the group gone for this user (e.g. they left on another device).
  if (!bundle) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold">You&apos;re no longer in this group</h1>
        <Button asChild variant="outline">
          <Link href="/">Go to my groups</Link>
        </Button>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 backdrop-blur">
        <GroupSwitcher current={bundle.group} groups={groups} />
        <Link
          href={`/g/${bundle.group.id}/settings`}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings aria-hidden className="size-5" />
          <span className="sr-only">Group settings</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-8 px-4 py-6">
        <Members members={bundle.members} />
        {bundle.expenses.length === 0 ? (
          <section aria-labelledby="expenses-heading" className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <h2 id="expenses-heading" className="text-lg font-medium">
              No expenses yet
            </h2>
            <p className="max-w-xs text-sm text-muted-foreground">Expenses added to this group will show up here.</p>
          </section>
        ) : (
          <section aria-labelledby="expenses-heading">
            {/* The full list (grouped by date) replaces this in the next task. */}
            <h2 id="expenses-heading" className="text-lg font-medium">
              {bundle.expenses.length} {bundle.expenses.length === 1 ? "expense" : "expenses"}
            </h2>
          </section>
        )}
      </main>
    </>
  );
}

function Members({ members }: { members: BundleMember[] }) {
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
