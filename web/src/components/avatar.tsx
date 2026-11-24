"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { avatarColor, initialOf } from "@/lib/avatar";

const SIZES = {
  xs: "size-7 text-[11px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-11 text-base",
} as const;

/**
 * A member's round avatar: their Google photo when they have one, else their
 * initial on a colour that stays the same for that member. If the photo fails
 * to load (offline, expired link), it falls back to the initial.
 *
 * Decorative by default (the name is usually written beside it); pass `label`
 * when the avatar stands alone, e.g. in the header.
 */
export function Avatar({
  id,
  name,
  photoUrl,
  size = "md",
  label,
  className,
}: {
  id: string;
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A photo that failed while the page was still server-rendered fired its
  // error before React was listening, so check once on mount as well.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  const showPhoto = Boolean(photoUrl) && !failed;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-avatar={showPhoto ? "photo" : "initial"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none",
        SIZES[size],
        className,
      )}
      style={showPhoto ? undefined : { backgroundColor: avatarColor(id) }}
    >
      {showPhoto ? (
        // A plain <img>: small external photos (Google), no optimisation needed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={photoUrl!}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
