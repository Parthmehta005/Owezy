"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Show cached data instantly; refetch in the background when the
        // user returns to the tab so friends' changes appear (no realtime in v1).
        staleTime: 30_000,
        refetchOnWindowFocus: true,
      },
    },
  });
}

function getQueryClient() {
  // Keep server renders isolated; reuse one client in the browser.
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
