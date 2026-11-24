import { describe, expect, it } from "vitest";
import { contrast } from "./contrast";
import { AVATAR_COLORS, avatarColor, groupAvatarColors, initialOf } from "./avatar";

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

describe("groupAvatarColors", () => {
  it("gives the first eight members of a group different colours, in member order", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `m${i}`);
    const colors = groupAvatarColors(ids);
    expect(new Set(colors.values()).size).toBe(8);
    expect(colors.get("m0")).toBe(AVATAR_COLORS[0]);
    expect(groupAvatarColors([...ids, "m8"]).get("m8")).toBe(AVATAR_COLORS[0]); // then they repeat
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
