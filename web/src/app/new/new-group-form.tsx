"use client";

import { useActionState, useState } from "react";
import { NameChipsInput } from "@/components/name-chips-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addNames } from "@/core/names";
import { createGroup, type CreateGroupState } from "./actions";

/** First problem with the names, using the same rules as the database. */
function namesProblem(myName: string, others: string[]): string | null {
  if (!myName.trim()) return null; // the required field handles this
  try {
    if (others.length) addNames([myName.trim()], others);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function NewGroupForm({ defaultMyName }: { defaultMyName: string }) {
  const [state, formAction, pending] = useActionState<CreateGroupState, FormData>(createGroup, {});
  const [myName, setMyName] = useState(defaultMyName);
  const [others, setOthers] = useState<string[]>([]);
  const problem = namesProblem(myName, others);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="group_name">Group name</Label>
        <Input id="group_name" name="group_name" placeholder="e.g. Goa trip" maxLength={60} required autoFocus />
      </div>

      <div className="space-y-2">
        <Label htmlFor="my_name">Your name in this group</Label>
        <Input
          id="my_name"
          name="my_name"
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          maxLength={40}
          required
          autoComplete="given-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="others">Who else?</Label>
        <NameChipsInput
          id="others"
          name="others"
          names={others}
          onNamesChange={setOthers}
          invalid={Boolean(problem)}
          placeholder="Type names, e.g. Rahul Neha"
          describedBy="others-hint"
        />
        <p id="others-hint" className={problem ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {problem ?? "Optional. You can also invite people with a link later."}
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending || Boolean(problem)}>
        {pending ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}
