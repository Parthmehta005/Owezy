"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/** How far (px, after resistance) the finger must pull before letting go refreshes. */
const THRESHOLD = 64;
const MAX = 96;

/** Running as an installed home-screen app (no browser pull-to-reload there). */
function isInstalledApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Pull down from the top of the screen to refresh, for the installed app.
 * iPhone home-screen apps have no pull-to-refresh at all, and Android's
 * reloads the whole page; this one refreshes the data in place. In a normal
 * browser tab it stays off, so the browser's own pull-to-reload works.
 * Pulls that start inside a sheet or dialog are ignored.
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!isInstalledApp()) return;
    let startY: number | null = null;
    let distance = 0;
    let busy = false;

    const start = (e: TouchEvent) => {
      const inSheet = (e.target as Element | null)?.closest?.("[role=dialog], [data-vaul-drawer]");
      startY = !busy && window.scrollY <= 0 && e.touches.length === 1 && !inSheet ? e.touches[0].clientY : null;
      distance = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy === 0) return; // fingers often report a first move without moving
      if (dy < 0 || window.scrollY > 0) {
        startY = null;
        distance = 0;
        setPull(0);
        return;
      }
      e.preventDefault(); // stop the page bouncing while we pull
      distance = Math.min(MAX, dy * 0.5);
      setPull(distance);
    };
    const end = () => {
      if (startY === null) return;
      startY = null;
      if (distance < THRESHOLD) {
        setPull(0);
        return;
      }
      busy = true;
      setRefreshing(true);
      setPull(THRESHOLD);
      onRefreshRef.current().finally(() => {
        busy = false;
        setRefreshing(false);
        setPull(0);
      });
    };

    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  if (pull === 0 && !refreshing) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div
      role="status"
      aria-label={refreshing ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}
      data-testid="pull-to-refresh"
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 flex justify-center"
      // Follow the finger exactly while pulling; ease into place once refreshing.
      style={{ transform: `translateY(${pull - 40}px)`, transition: refreshing ? "transform 150ms ease-out" : "none" }}
    >
      <span className="flex size-10 items-center justify-center rounded-full border bg-background shadow-md">
        <RefreshCw
          aria-hidden
          className={`size-5 ${ready || refreshing ? "text-primary" : "text-muted-foreground"} ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${(pull / THRESHOLD) * 270}deg)` }}
        />
      </span>
    </div>
  );
}
