import { formatMoney } from "@/lib/invoice";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Weekly earnings as a column chart — one bar per day, Monday-first. Days up to
 * and including today read in gold; today is emphasized; future days sit as a
 * faint track so the week visibly "fills up". Pure CSS/flex, so it scales to any
 * width without SVG stroke distortion and renders on the server. Each bar
 * carries a native tooltip; the whole thing is labelled for screen readers.
 */
export function WeeklyChart({
  values,
  todayIndex,
  currency,
}: {
  values: number[];
  todayIndex: number;
  currency: string;
}) {
  const max = Math.max(...values, 0.01);

  return (
    <div
      className="flex items-stretch gap-1.5 sm:gap-2.5"
      style={{ height: "9rem" }}
      role="img"
      aria-label="Daily earnings this week"
    >
      {values.map((v, i) => {
        const pct = v > 0 ? Math.max((v / max) * 100, 5) : 0;
        const isToday = i === todayIndex;
        const isFuture = i > todayIndex;
        const fill = isToday
          ? "var(--gold)"
          : isFuture
            ? "var(--surface-3)"
            : "var(--gold-line)";
        return (
          <div
            key={i}
            className="flex-1 min-w-0 flex flex-col items-center gap-2"
            title={`${DAY_LABELS[i]} · ${isFuture ? "—" : formatMoney(v, currency)}`}
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
              className={`label leading-none ${isToday ? "text-gold" : ""}`}
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
