import { formatMoney } from "@/lib/invoice";
import { formatHours } from "@/lib/time";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Weekly totals as a column chart — one bar per day, Monday-first. Days up to
 * and including today read in the active tone; today is emphasized; future days
 * sit as a faint track so the week visibly "fills up". Pure CSS/flex, so it
 * scales to any width without SVG stroke distortion and renders on the server.
 * Each bar carries a native tooltip; the whole thing is labelled for screen
 * readers.
 *
 * Two units share one chart: account-wide earnings (money · gold) on Today, and
 * project tracked time (seconds · teal) on the project dashboard.
 */
export function WeeklyChart({
  values,
  todayIndex,
  currency,
  unit = "money",
  tone = "gold",
}: {
  /** Money amounts when `unit="money"`, whole seconds when `unit="hours"`. */
  values: number[];
  todayIndex: number;
  currency: string;
  unit?: "money" | "hours";
  tone?: "gold" | "accent";
}) {
  const max = Math.max(...values, 0.01);
  const strong = tone === "gold" ? "var(--gold)" : "var(--accent)";
  const soft = tone === "gold" ? "var(--gold-line)" : "var(--accent-line)";
  const label = (v: number) =>
    unit === "money" ? formatMoney(v, currency) : `${formatHours(v)} h`;

  return (
    <div
      className="flex items-stretch gap-1.5 sm:gap-2.5"
      style={{ height: "9rem" }}
      role="img"
      aria-label={
        unit === "money" ? "Daily earnings this week" : "Daily tracked time this week"
      }
    >
      {values.map((v, i) => {
        const pct = v > 0 ? Math.max((v / max) * 100, 5) : 0;
        const isToday = i === todayIndex;
        const isFuture = i > todayIndex;
        const fill = isToday ? strong : isFuture ? "var(--surface-3)" : soft;
        return (
          <div
            key={i}
            className="flex-1 min-w-0 flex flex-col items-center gap-2"
            title={`${DAY_LABELS[i]} · ${isFuture ? "—" : label(v)}`}
          >
            <div className="w-full flex-1 flex items-end">
              {isFuture ? (
                <div
                  className="w-full rounded-t-[5px]"
                  style={{ height: "6%", background: "var(--surface-3)" }}
                />
              ) : (
                <div
                  className="w-full rounded-t-[5px] transition-[height] duration-500"
                  style={{
                    height: `${pct || 4}%`,
                    background: fill,
                    minHeight: v > 0 ? 4 : 3,
                  }}
                />
              )}
            </div>
            <span
              className={`label leading-none ${
                isToday ? (tone === "gold" ? "text-gold" : "text-accent") : ""
              }`}
              style={{ fontSize: "0.6rem" }}
            >
              {DAY_LABELS[i].charAt(0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
