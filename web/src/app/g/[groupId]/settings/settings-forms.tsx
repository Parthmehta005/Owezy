"use client";

import { Avatar } from "@/components/avatar";
import { useActionState, useState } from "react";
import { NameChipsInput } from "@/components/name-chips-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addNames } from "@/core/names";
import type { GroupMember } from "@/lib/data/groups";
import { addMembers, leaveGroup, removeMember, renameGroup, type SettingsState } from "./actions";

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="text-sm text-positive">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function RenameForm({ groupId, name }: { groupId: string; name: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(renameGroup, {});
  const [value, setValue] = useState(name);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="group_id" value={groupId} />
      <Label htmlFor="group-name">Group name</Label>
      <div className="flex gap-2">
        <Input id="group-name" name="name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} required />
        <Button type="submit" variant="outline" disabled={pending || value.trim() === name || !value.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function MemberRow({ groupId, member }: { groupId: string; member: GroupMember }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(removeMember, {});
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <Avatar id={member.id} name={member.displayName} photoUrl={member.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate">
            {member.displayName}
            {member.isMe && <span className="text-muted-foreground"> (you)</span>}
          </p>
          <p className="text-xs text-muted-foreground">{member.isPlaceholder ? "Not joined yet" : "Joined"}</p>
        </div>
        {member.isPlaceholder && (
          <form action={action}>
            <input type="hidden" name="group_id" value={groupId} />
            <input type="hidden" name="member_id" value={member.id} />
            <input type="hidden" name="member_name" value={member.displayName} />
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" disabled={pending}>
              {pending ? "Removing…" : "Remove"}
              <span className="sr-only"> {member.displayName}</span>
            </Button>
          </form>
        )}
      </div>
      {state.error && <Feedback state={state} />}
    </li>
  );
}

export function AddMembersForm({ groupId, existingNames }: { groupId: string; existingNames: string[] }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addMembers, {});
  const [names, setNames] = useState<string[]>([]);
  let problem: string | null = null;
  if (names.length) {
    try {
      addNames(existingNames, names);
    } catch (e) {
      problem = (e as Error).message;
    }
  }
  return (
    <form
      action={async (form) => {
        await action(form);
        setNames([]);
      }}
      className="space-y-2"
    >
      <input type="hidden" name="group_id" value={groupId} />
      <Label htmlFor="new-names">Add people</Label>
      <NameChipsInput
        id="new-names"
        name="new_names"
        names={names}
        onNamesChange={setNames}
        invalid={Boolean(problem)}
        placeholder="Type names, e.g. Kiran Zoya"
        describedBy="new-names-hint"
      />
      <p id="new-names-hint" className={problem ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {problem ?? "They can claim their name when they join with the invite link."}
      </p>
      <Button type="submit" variant="outline" disabled={pending || Boolean(problem)}>
        {pending ? "Adding…" : "Add"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function LeaveGroup({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="outline" className="w-full text-destructive" onClick={() => setConfirming(true)}>
        Leave group
      </Button>
    );
  }
  return (
    <form action={leaveGroup} className="space-y-3 rounded-lg border border-destructive/30 p-4">
      <input type="hidden" name="group_id" value={groupId} />
      <p className="text-sm">
        Leave <span className="font-medium">{groupName}</span>? Your name and expenses stay in the group, and you&apos;ll
        need the invite link to come back.
      </p>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" className="flex-1">
          Leave
        </Button>
        <Button type="button" variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
