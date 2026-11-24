"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "cn";

const OPTIONS = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

const noop = () => () => {};

/**
 * Light / dark / follow the phone. Saved on this device (next-themes keeps it
 * in local storage) and applied instantly. Before hydration nothing is shown
 * as chosen, because the saved choice is only known in the browser.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const current = mounted ? (theme ?? "system") : null;
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold",
            current === value ? "bg-card shadow-sm dark:bg-secondary" : "text-muted-foreground",
          )}
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Keeps the phone's status-bar colour in step with the chosen theme (the
 * theme-color tags only follow the phone's own setting by default).
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === "dark" ? "#0e1220" : "#f5f6f8";
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = color;
    });
  }, [resolvedTheme]);
  return null;
}
