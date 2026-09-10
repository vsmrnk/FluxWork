/**
 * Grammar for the "Add time" field. Runs client-side for instant feedback and
 * server-side to re-validate, so this module must stay free of directives.
 *
 *   duration units   2h · 45m · 1h 30m · 1h30m · 1.5h · 90m
 *   duration h:mm    1:30  (→ 1 h 30 m)
 *   clock range      9:30-11:00 · 9-11 · 13:00–14:30  (dash or en/em dash)
 */

type ParsedTimeInput =
  | { ok: true; seconds: number; range: { startMinutes: number; endMinutes: number } | null }
  | { ok: false; error: string };

const DASH_RE = /\s*[-–—]\s*/;
const UNIT_RE = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)/gi;

/** A 24-hour clock token ("9" or "9:30") → minutes since midnight, or null. */
function parseClock(token: string): number | null {
  const m = token.trim().match(/^(\d{1,2})(?::([0-5]?\d))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Sum a units expression ("1h 30m") to seconds; null if any stray text remains. */
function parseUnits(s: string): number | null {
  // Anything left after removing the recognised tokens means it isn't a duration.
  if (s.replace(UNIT_RE, " ").trim().length > 0) return null;
  let seconds = 0;
  let matched = false;
  UNIT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = UNIT_RE.exec(s)) !== null) {
    matched = true;
    const value = parseFloat(m[1]);
    seconds += m[2].toLowerCase().startsWith("h") ? value * 3600 : value * 60;
  }
  return matched ? Math.round(seconds) : null;
}

export function parseTimeInput(raw: string): ParsedTimeInput {
  const s = raw.trim();
  if (!s) return { ok: false, error: "Enter a time like 2h, 1:30, or 9:30-11:00." };

  // Range: two clock times split by a dash.
  if (DASH_RE.test(s)) {
    const parts = s.split(DASH_RE);
    if (parts.length !== 2) return { ok: false, error: "Enter a range like 9:30-11:00." };
    const start = parseClock(parts[0]);
    const end = parseClock(parts[1]);
    if (start == null || end == null) {
      return { ok: false, error: "Use 24-hour times, like 9:30-11:00." };
    }
    if (end <= start) return { ok: false, error: "The end must be after the start." };
    return {
      ok: true,
      seconds: (end - start) * 60,
      range: { startMinutes: start, endMinutes: end },
    };
  }

  // Duration h:mm (e.g. 1:30). Hours may exceed 24 here; minutes stay < 60.
  const colon = s.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (colon) {
    const seconds = (Number(colon[1]) * 60 + Number(colon[2])) * 60;
    if (seconds <= 0) return { ok: false, error: "Enter a time longer than zero." };
    return { ok: true, seconds, range: null };
  }

  // Duration with units.
  const unitSeconds = parseUnits(s);
  if (unitSeconds != null) {
    if (unitSeconds <= 0) return { ok: false, error: "Enter a time longer than zero." };
    return { ok: true, seconds: unitSeconds, range: null };
  }

  return { ok: false, error: "Try a time like 2h, 1:30, 45m, or 9:30-11:00." };
}

/** Minutes-since-midnight → "HH:MM". */
function minutesToClock(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Resolve a parsed input to concrete start/end instants on a chosen day.
 *
 * Anchor rule (deterministic, shared by preview and insert): a typed range uses
 * its own times on that day; a bare duration is anchored as a range ending at
 * the current time when the chosen date is today, otherwise ending at 17:00 on
 * that date, with the start set to end − duration.
 */
export function resolveEntryTimes(
  parsed: { seconds: number; range: { startMinutes: number; endMinutes: number } | null },
  dateStr: string,
  isToday: boolean,
  now: Date = new Date(),
): { started: Date; ended: Date } {
  if (parsed.range) {
    return {
      started: new Date(`${dateStr}T${minutesToClock(parsed.range.startMinutes)}`),
      ended: new Date(`${dateStr}T${minutesToClock(parsed.range.endMinutes)}`),
    };
  }
  const ended = isToday ? now : new Date(`${dateStr}T17:00`);
  const started = new Date(ended.getTime() - parsed.seconds * 1000);
  return { started, ended };
}

/** Spoken duration for the field preview, e.g. "1 h 30 m", "45 m", "2 h". */
export function formatDurationWords(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} h ${m} m`;
  if (h > 0) return `${h} h`;
  return `${m} m`;
}
