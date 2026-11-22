"use client";

import "./globals.css";

/** Last resort, when even the app's frame fails. Renders its own page. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
        <title>Owezy</title>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-xs text-muted-foreground">Owezy didn&apos;t load. Check your connection and try again.</p>
        <button type="button" onClick={() => retry()} className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground">
          Try again
        </button>
      </body>
    </html>
  );
}
