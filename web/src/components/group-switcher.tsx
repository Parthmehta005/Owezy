"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { GroupSummary } from "@/lib/data/groups";

/** The group name in the header; tapping it opens a sheet to switch groups. */
export function GroupSwitcher({ current, groups }: { current: GroupSummary; groups: GroupSummary[] }) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="-mx-2 flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-left text-xl font-semibold tracking-tight hover:bg-muted"
        >
          <span className="truncate">{current.name}</span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <span className="sr-only">Switch group</span>
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-[480px]">
          <DrawerHeader>
            <DrawerTitle>Your groups</DrawerTitle>
            <DrawerDescription className="sr-only">Choose a group to open.</DrawerDescription>
          </DrawerHeader>
          <nav className="max-h-[50vh] overflow-y-auto px-2">
            <ul>
              {groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/g/${g.id}`}
                    aria-current={g.id === current.id ? "page" : undefined}
                    className="flex items-center justify-between gap-3 rounded-md px-3 py-3 hover:bg-muted"
                  >
                    <span className="truncate">{g.name}</span>
                    {g.id === current.id && <Check aria-hidden className="size-4 text-primary" />}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <DrawerFooter>
            <form action={signOut}>
              <Button type="submit" variant="ghost" className="w-full text-muted-foreground">
                Sign out
              </Button>
            </form>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
