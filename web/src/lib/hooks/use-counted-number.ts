"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 450;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A number that counts smoothly to its new value when it changes (the
 * balance total after you add an expense). Starts at the value it's given,
 * so nothing moves on first paint; jumps straight there with "reduce motion".
 */
export function useCountedNumber(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (reducedMotion()) {
      from.current = target;
      const id = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(id);
    }
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - began) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3; // ease-out
      const value = Math.round(start + (target - start) * eased);
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}
