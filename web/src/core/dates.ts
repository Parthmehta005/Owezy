/**
 * Calendar dates ("YYYY-MM-DD", no time zone) as the app shows them.
 * Owezy is INR-only, so "today" means today in India.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's date in India for the given moment, as "YYYY-MM-DD". */
export function indiaDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

function parse(date: string): Date {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Not a calendar date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Days from `a` to `b` (b - a), both calendar dates. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** Add whole days to a calendar date. */
export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * "Today", "Yesterday", "Tomorrow", otherwise "Mon, 18 Nov", with the year
 * added ("Mon, 18 Nov 2024") when it isn't the current year.
 */
export function dateLabel(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  // Built from parts so punctuation doesn't depend on the browser's locale data.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      .formatToParts(parse(date))
      .map((p) => [p.type, p.value]),
  );
  const label = `${parts.weekday}, ${parts.day} ${parts.month}`;
  return date.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${parts.year}`;
}

/** Split an already-sorted list into runs that share the same date, keeping order. */
export function groupByDate<T>(items: readonly T[], dateOf: (item: T) => string): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const item of items) {
    const date = dateOf(item);
    const last = groups.at(-1);
    if (last && last.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}
