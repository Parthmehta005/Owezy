/**
 * Avatar colours and initials. Every colour carries white text at >= 4.5:1
 * (avatar.test.ts checks), and none is green or purple, to match the palette.
 */
export const AVATAR_COLORS = [
  "#2457d6", // cobalt
  "#b33b0b", // burnt orange
  "#a3216b", // raspberry
  "#0e6c8a", // ocean
  "#8a5a1f", // walnut
  "#4a5872", // slate
  "#b4233a", // crimson
  "#1f6fb2", // sky
] as const;

/**
 * Colours for a group's members, by member order, so the first eight people
 * in a group never share a colour (and keep theirs as others join).
 */
export function groupAvatarColors(memberIds: readonly string[]): Map<string, string> {
  return new Map(memberIds.map((id, i) => [id, AVATAR_COLORS[i % AVATAR_COLORS.length]]));
}

/** A stable colour for a member when the group isn't known: the same member always gets the same one. */
export function avatarColor(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** First letter of the name, uppercased ("?" for an empty name). Handles non-Latin scripts. */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toLocaleUpperCase("en-IN") : "?";
}
