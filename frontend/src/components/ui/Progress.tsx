export function ProgressBar({
  value,
  max,
  tone = "brand",
}: {
  value: number;
  max: number;
  tone?: "brand" | "emerald" | "amber" | "red";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  const bar =
    over
      ? "bg-red-500"
      : tone === "emerald"
        ? "bg-emerald-500"
        : tone === "amber"
          ? "bg-amber-500"
          : "bg-brand-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
      <div
        className={`h-full rounded-full transition-all ${bar}`}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}
