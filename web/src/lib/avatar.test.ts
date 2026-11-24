import { describe, expect, it } from "vitest";
import { contrast } from "./contrast";
import { AVATAR_COLORS, avatarColor, initialOf } from "./avatar";

describe("avatar colours", () => {
  it.each(AVATAR_COLORS)("white text on %s is at least 4.5:1", (color) => {
    expect(contrast("#ffffff", color)).toBeGreaterThanOrEqual(4.5);
  });

  it("are stable per member and spread across the palette", () => {
    expect(avatarColor("member-1")).toBe(avatarColor("member-1"));
    const used = new Set(Array.from({ length: 40 }, (_, i) => avatarColor(crypto.randomUUID() + i)));
    expect(used.size).toBeGreaterThan(4);
  });
});

describe("initialOf", () => {
  it("takes the first letter, uppercased", () => {
    expect(initialOf("asha")).toBe("A");
    expect(initialOf("  rahul ")).toBe("R");
    expect(initialOf("राहुल")).toBe("र");
    expect(initialOf("")).toBe("?");
  });
});
