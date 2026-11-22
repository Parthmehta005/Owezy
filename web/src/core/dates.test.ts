import { describe, expect, it } from "vitest";
import { addDays, dateLabel, daysBetween, groupByDate, indiaDate } from "./dates";

describe("indiaDate", () => {
  it("uses India time, not UTC", () => {
    // 20:00 UTC on 21 Nov is 01:30 IST on 22 Nov.
    expect(indiaDate(new Date("2026-11-21T20:00:00Z"))).toBe("2026-11-22");
    // 18:00 UTC is 23:30 IST, still the same day.
    expect(indiaDate(new Date("2026-11-21T18:00:00Z"))).toBe("2026-11-21");
  });
});

describe("daysBetween / addDays", () => {
  it("counts calendar days across months and years", () => {
    expect(daysBetween("2026-11-30", "2026-12-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2026-01-01")).toBe(-364);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("rejects things that aren't calendar dates", () => {
    expect(() => daysBetween("21/11/2026", "2026-11-21")).toThrow();
  });
});

describe("dateLabel", () => {
  const today = "2026-11-22";
  it("names nearby days", () => {
    expect(dateLabel("2026-11-22", today)).toBe("Today");
    expect(dateLabel("2026-11-21", today)).toBe("Yesterday");
    expect(dateLabel("2026-11-23", today)).toBe("Tomorrow");
  });

  it("shows weekday, day and month, and the year only when it differs", () => {
    expect(dateLabel("2026-11-18", today)).toBe("Wed, 18 Nov");
    expect(dateLabel("2025-12-25", today)).toBe("Thu, 25 Dec 2025");
  });

  it("is not shifted by the computer's time zone", () => {
    // Formatting uses UTC for a UTC-midnight date, so it can't slip a day.
    expect(dateLabel("2026-01-01", "2026-06-01")).toBe("Thu, 1 Jan");
  });
});

describe("groupByDate", () => {
  it("groups consecutive items with the same date, keeping order", () => {
    const items = [
      { id: 1, d: "2026-11-22" },
      { id: 2, d: "2026-11-22" },
      { id: 3, d: "2026-11-20" },
    ];
    expect(groupByDate(items, (i) => i.d)).toEqual([
      { date: "2026-11-22", items: [items[0], items[1]] },
      { date: "2026-11-20", items: [items[2]] },
    ]);
    expect(groupByDate([], (i: { d: string }) => i.d)).toEqual([]);
  });
});
