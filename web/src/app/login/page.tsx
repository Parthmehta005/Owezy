import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Owezy" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-10 px-4 pt-[calc(3rem+env(safe-area-inset-top))] pb-12">
      <div className="space-y-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Owezy</h1>
        <p className="text-muted-foreground">Split expenses with friends in a few taps.</p>
      </div>
      {/* The form reads ?next and ?error from the URL, so it renders after the static shell. */}
      <Suspense fallback={<div className="h-56" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
