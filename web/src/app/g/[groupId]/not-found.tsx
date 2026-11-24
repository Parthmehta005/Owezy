import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GroupNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Users className="size-7" />
      </span>
      <h1 className="text-xl font-bold">Group not found</h1>
      <p className="max-w-xs text-muted-foreground">
        This group doesn&apos;t exist, or you aren&apos;t a member of it. If someone shared it with you, ask them for
        the invite link.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Go to my groups</Link>
      </Button>
    </main>
  );
}
