"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/hooks/use-online";

/** Any screen that fails to load (server down, lost connection mid-load). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const online = useOnline();
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pt-[env(safe-area-inset-top)] text-center">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <CloudOff className="size-7" />
      </span>
      <h1 className="text-xl font-bold">{online ? "Something went wrong" : "You're offline"}</h1>
      <p className="max-w-xs text-muted-foreground">
        {online
          ? "This screen didn't load. It's usually a passing hiccup, so try again."
          : "Owezy needs a connection to load this. Try again once you're back online."}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Go to my groups</Link>
        </Button>
      </div>
    </main>
  );
}
