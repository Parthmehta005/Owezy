import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps paths on this site, with query and hash", () => {
    expect(safeNextPath("/g/123")).toBe("/g/123");
    expect(safeNextPath("/join/AbC-12_xyz?x=1#top")).toBe("/join/AbC-12_xyz?x=1#top");
  });

  it.each([
    null,
    undefined,
    "",
    "g/123",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "javascript:alert(1)",
  ])("falls back to / for %j", (bad) => {
    expect(safeNextPath(bad)).toBe("/");
  });

  it("never returns something that leaves the site", () => {
    for (const input of ["/%2F%2Fevil.com", "/..//evil.com", "/./../../evil"]) {
      const out = safeNextPath(input);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
    }
  });
});

describe("isPublicPath", () => {
  it("allows only the sign-in pages", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/g/123")).toBe(false);
    expect(isPublicPath("/join/abc")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});
