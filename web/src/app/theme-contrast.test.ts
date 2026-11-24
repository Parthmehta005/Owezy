import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [text, background] pairs the UI uses. "white" is the text on the filled balance box. */
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
