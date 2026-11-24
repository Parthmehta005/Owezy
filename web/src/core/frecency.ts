/**
 * "Frecency": which group to open by default. Each time you open a group its
 * score gains 1, after older opens have faded: a score halves every 7 days.
 * So a group you open often wins, but a group you used a lot months ago
 * fades behind one you use every day now. Re-opening within 30 minutes
 * (reloads, switching back and forth) doesn't count again.
 *
 * The database mirrors recordOpen in public.record_group_open; this module
 * ranks what it stored.
 */
export const HALF_LIFE_DAYS = 7;
export const REPEAT_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A score decayed from when it was last updated to `now`. */
export function decayedScore(score: number, openedAt: Date | null, now: Date): number {
  if (!openedAt || score <= 0) return 0;
  const days = Math.max(0, now.getTime() - openedAt.getTime()) / DAY_MS;
  return score * 0.5 ** (days / HALF_LIFE_DAYS);
}

/** The stored values after opening the group at `now`. */
export function recordOpen(score: number, openedAt: Date | null, now: Date): { score: number; openedAt: Date } {
  const decayed = decayedScore(score, openedAt, now);
  const repeat = openedAt !== null && now.getTime() - openedAt.getTime() < REPEAT_WINDOW_MS;
  return { score: repeat ? decayed : decayed + 1, openedAt: now };
}

export interface FrecencyEntry {
  name: string;
  score: number;
  openedAt: Date | null;
}

/**
 * Most-to-least likely to be wanted: highest decayed score first; ties go to
 * the more recently opened; never-opened groups last, by name.
 */
export function rankByFrecency<T extends FrecencyEntry>(entries: readonly T[], now: Date): T[] {
  const value = (e: T) => decayedScore(e.score, e.openedAt, now);
  return [...entries].sort(
    (a, b) =>
      value(b) - value(a) ||
      (b.openedAt?.getTime() ?? 0) - (a.openedAt?.getTime() ?? 0) ||
      a.name.localeCompare(b.name),
  );
}
