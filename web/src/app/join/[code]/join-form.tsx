"use client";

import { Avatar } from "@/components/avatar";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinGroup, type JoinState } from "./actions";

export function JoinForm({
  code,
  unclaimed,
  defaultName,
}: {
  code: string;
  unclaimed: { id: string; displayName: string }[];
  defaultName: string;
}) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinGroup, {});
  const [name, setName] = useState(defaultName);

  return (
    <div className="space-y-8">
      {state.error && (
        <p role="alert" className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}

      {unclaimed.length > 0 && (
        <section aria-labelledby="claim-heading" className="space-y-3">
          <h2 id="claim-heading" className="font-semibold">
            Which one are you?
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {unclaimed.map((m) => (
              <li key={m.id}>
                <form action={action}>
                  <input type="hidden" name="code" value={code} />
                  <input type="hidden" name="claim_member_id" value={m.id} />
                  <Button type="submit" variant="outline" size="lg" className="w-full" disabled={pending}>
                    <Avatar id={m.id} name={m.displayName} size="xs" />
                    <span className="sr-only">I&apos;m </span>
                    <span className="truncate">{m.displayName}</span>
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="new-heading" className="space-y-3">
        <h2 id="new-heading" className="font-semibold">
          {unclaimed.length > 0 ? "Not on the list?" : "Your name in this group"}
        </h2>
        <form action={action} className="flex gap-2">
          <input type="hidden" name="code" value={code} />
          <Label htmlFor="new_name" className="sr-only">
            Your name
          </Label>
          <Input
            id="new_name"
            name="new_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
            autoComplete="given-name"
          />
          <Button type="submit" disabled={pending || !name.trim()}>
            {unclaimed.length > 0 ? "I'm new" : "Join"}
          </Button>
        </form>
      </section>
    </div>
  );
}
