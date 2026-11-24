import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Owezy" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-10 px-4 pt-[calc(3rem+env(safe-area-inset-top))] pb-12">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* The app icon (src/app/icon.svg), decorative next to the name. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={72} height={72} className="rounded-[1.25rem] shadow-lg shadow-primary/20" />
        <h1 className="text-4xl font-extrabold tracking-tight">Owezy</h1>
        <p className="text-muted-foreground">Split expenses with friends in a few taps.</p>
      </div>
      {/* The form reads ?next and ?error from the URL, so it renders after the static shell. */}
      <Suspense fallback={<div className="h-56" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
