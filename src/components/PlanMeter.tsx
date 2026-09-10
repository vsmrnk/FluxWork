/**
 * `bar` is the quota meter on the Plan page; `inline` is the quiet counter next
 * to a create action. The fill turns brass at the ceiling.
 */
export function PlanMeter({
  label,
  used,
  limit,
  variant = "bar",
}: {
  label: string;
  used: number;
  limit: number;
  variant?: "bar" | "inline";
}) {
  const unlimited = !Number.isFinite(limit);
  const atLimit = !unlimited && used >= limit;
  const pct = unlimited || limit <= 0 ? 0 : Math.min(100, (used / limit) * 100);
  const count = unlimited ? String(used) : `${used} of ${limit}`;

  if (variant === "inline") {
    return (
      <span
        className="num text-xs"
        style={{ color: atLimit ? "var(--brass-ink)" : "var(--ink-3)" }}
      >
        {count} free {label}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="num text-sm text-ink-2">
          {unlimited ? "Unlimited" : count}
        </span>
      </div>
      {!unlimited && (
        <div className="split">
          <i
            className="bill"
            style={{
              width: `${pct}%`,
              background: atLimit ? "var(--brass)" : undefined,
            }}
          />
        </div>
      )}
    </div>
  );
}

/** A paid-only capability row — brass "Pro" when locked, green when included. */
export function PlanFeature({
  label,
  unlocked,
}: {
  label: string;
  unlocked: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <span className={`badge ${unlocked ? "badge-bill" : "badge-norate"}`}>
        Pro
      </span>
    </div>
  );
}
