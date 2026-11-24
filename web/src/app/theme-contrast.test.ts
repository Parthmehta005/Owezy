import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast } from "@/lib/contrast";

/**
 * Every text colour the app puts on a background must stay readable
 * (WCAG AA, 4.5:1), in both themes. Reads the tokens straight from
 * globals.css so a palette change can't skip the check.
 */
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const block = new RegExp(`${selector.replace(".", "\\.")} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

/** [text, background] pairs the UI uses. */
const PAIRS: [string, string][] = [
  ...["background", "card", "muted", "secondary"].map((bg): [string, string] => ["foreground", bg]),
  ...["background", "card", "muted"].map((bg): [string, string] => ["muted-foreground", bg]),
  ...["background", "card", "muted"].flatMap((bg): [string, string][] => [
    ["positive", bg],
    ["negative", bg],
    ["primary", bg],
    ["destructive", bg],
  ]),
  ["primary-foreground", "primary"],
  ["primary-foreground", "negative"], // text on the "You owe" balance box
  ["accent-foreground", "accent"],
  ["secondary-foreground", "secondary"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
];

describe.each([":root", ".dark"] as const)("theme %s", (selector) => {
  const t = tokens(selector);

  it("defines every token the checks need", () => {
    for (const [fg, bg] of PAIRS) {
      expect(t[fg], fg).toMatch(/^#/);
      expect(t[bg], bg).toMatch(/^#/);
    }
  });

  it.each(PAIRS)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("contrast()", () => {
  it("matches known values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
