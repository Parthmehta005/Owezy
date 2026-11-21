"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The group's invite link with Share (phone share sheet, e.g. WhatsApp) and Copy. */
export function InviteLink({ code, groupName }: { code: string; groupName: string }) {
  const path = `/join/${code}`;
  // The site's address is only known in the browser, so fill it in after mount.
  const [url, setUrl] = useState(path);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only values, read once after hydration
    setUrl(window.location.origin + path);
    setCanShare(typeof navigator.share === "function");
  }, [path]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    try {
      await navigator.share({ title: `Join ${groupName} on Owezy`, text: `Join "${groupName}" on Owezy to split expenses:`, url });
    } catch {
      // Closing the share sheet throws AbortError; nothing to do.
    }
  }

  return (
    <div className="space-y-3">
      <p className="truncate rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm" data-testid="invite-url">
        {url}
      </p>
      <div className="flex gap-2">
        {canShare && (
          <Button type="button" className="flex-1" onClick={share}>
            <Share2 aria-hidden />
            Share
          </Button>
        )}
        <Button type="button" variant="outline" className="flex-1" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Anyone with this link can join and see this group&apos;s expenses.
      </p>
    </div>
  );
}
