import { startOfWeekUTC } from "@/lib/time";

// Half-open [start, end) ranges in UTC with Monday-based weeks, matching the
// Today metrics so every surface agrees on what "this week" means.

export const REPORT_RANGES = [
  { key: "this-week", label: "This week" },
  { key: "last-week", label: "Last week" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
] as const;

const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function weekSpanLabel(start: Date, end: Date): string {
  const last = new Date(end.getTime() - 86400000);
  return `${dayFmt.format(start)} – ${dayFmt.format(last)}`;
}

/** Resolves a raw searchParam into a concrete range, defaulting to this week. */
export function resolveRange(raw: string | null | undefined, now = new Date()) {
  const { key, label } = REPORT_RANGES.find((r) => r.key === raw) ?? REPORT_RANGES[0];

  const thisWeek = startOfWeekUTC(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  switch (key) {
    case "last-week": {
      const start = new Date(thisWeek.getTime() - 7 * 86400000);
      return { key, label, start, end: thisWeek, periodLabel: weekSpanLabel(start, thisWeek) };
    }
    case "this-month": {
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { key, label, start: monthStart, end, periodLabel: monthFmt.format(monthStart) };
    }
    case "last-month": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return { key, label, start, end: monthStart, periodLabel: monthFmt.format(start) };
    }
    case "this-week":
    default: {
      const end = new Date(thisWeek.getTime() + 7 * 86400000);
      return { key, label, start: thisWeek, end, periodLabel: weekSpanLabel(thisWeek, end) };
    }
  }
}
