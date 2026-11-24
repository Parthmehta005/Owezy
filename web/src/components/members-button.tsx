"use client";

import { MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import type { BundleMember } from "@/lib/data/bundle";

/** How many avatars the header shows before the ⋯. */
const SHOWN = 3;

/**
 * Top right of the group screen: the first few members' avatars (you first)
 * and a ⋯; tapping opens a sheet listing everyone in the group.
 */
export function MembersButton({ members }: { members: BundleMember[] }) {
  const ordered = [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe));
  const label = `${members.length} ${members.length === 1 ? "member" : "members"}`;
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 shrink-0 items-center rounded-full py-1 pr-1 pl-2 hover:bg-muted"
          aria-label={`${label}: show everyone`}
        >
          <span className="flex">
            {ordered.slice(0, SHOWN).map((m) => (
              <Avatar
                key={m.id}
                id={m.id}
                name={m.displayName}
                photoUrl={m.avatarUrl}
                size="xs"
                className="-ml-1.5 ring-2 ring-background first:ml-0"
              />
            ))}
          </span>
          <span className="ml-1 flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MoreHorizontal aria-hidden className="size-4" />
          </span>
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-[480px] pb-4">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-lg">{label}</DrawerTitle>
            <DrawerDescription className="sr-only">Everyone in this group.</DrawerDescription>
          </DrawerHeader>
          <ul className="max-h-[60vh] overflow-y-auto px-4" data-testid="members-list">
            {ordered.map((m) => (
              <li key={m.id} className="flex min-h-14 items-center gap-3">
                <Avatar id={m.id} name={m.displayName} photoUrl={m.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" data-testid="member-name">
                    {m.displayName}
                    {m.isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                  </span>
                  {m.isPlaceholder && <span className="block text-sm text-muted-foreground">Not joined yet</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
