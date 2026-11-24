import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pt-[env(safe-area-inset-top)] text-center">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <MapPinOff className="size-7" />
      </span>
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="max-w-xs text-muted-foreground">This link doesn&apos;t go anywhere in Owezy.</p>
      <Button asChild variant="outline">
        <Link href="/">Go to my groups</Link>
      </Button>
    </main>
  );
}
