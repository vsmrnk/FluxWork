export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Decimal hours, Harvest-style (e.g. 1.25). */
export function formatHours(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  return (s / 3600).toFixed(2);
}

/** Always h:mm, e.g. "2:05" or "0:00". */
export function formatClock(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function elapsedSeconds(startedAtIso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(startedAtIso).getTime()) / 1000));
}

/** Monday 00:00 UTC of the week containing `d`. */
export function startOfWeekUTC(d: Date): Date {
  const sinceMon = (d.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMon),
  );
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export function formatDate(iso: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}
