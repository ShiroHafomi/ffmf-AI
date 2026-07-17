// Shared formatting helpers for the FFMS frontend.
import type { Locale } from "@/lib/i18n/translations";

// The active locale, kept in sync with the language provider so that dates and
// numbers render in the user's chosen language. Defaults to English.
let activeLocale: Locale = "en";

export function setActiveLocale(l: Locale): void {
  activeLocale = l;
}

function intlLocale(): string {
  return activeLocale === "vi" ? "vi-VN" : "en-US";
}

export function fmtMoney(n: number | null | undefined, currency = "USD"): string {
  if (n == null || isNaN(Number(n))) return "—";
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return `$${Number(n).toLocaleString(intlLocale(), { maximumFractionDigits: 0 })}`;
  }
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(intlLocale(), { maximumFractionDigits: 0 });
}

export function fmtPercent(n: number | null | undefined, digits = 1): string {
  if (n == null || isNaN(Number(n))) return "—";
  const sign = Number(n) > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(digits)}%`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_VI = [
  "Thg 1", "Thg 2", "Thg 3", "Thg 4", "Thg 5", "Thg 6",
  "Thg 7", "Thg 8", "Thg 9", "Thg 10", "Thg 11", "Thg 12",
];

// "2026-07" -> "Jul" (or "Thg 7" in Vietnamese)
export function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7));
  const months = activeLocale === "vi" ? MONTHS_VI : MONTHS_EN;
  return months[(m - 1 + 12) % 12] ?? ym;
}

// "2026-07-15" -> "Jul 15, 2026" (localized)
export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(intlLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Initials for an avatar, e.g. "alice@example.com" -> "A"
export function initials(name?: string | null, email?: string | null): string {
  const source = (name || email || "?").trim();
  const first = source[0]?.toUpperCase() ?? "?";
  return first;
}

// Aggregate a flat expense list into monthly totals, oldest -> newest.
export interface MonthPoint {
  ym: string; // "2026-07"
  label: string; // "Jul"
  total: number;
}

export function aggregateByMonth(
  expenses: { amount: number; expense_date?: string }[],
): MonthPoint[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const ym = (e.expense_date ?? "").slice(0, 7);
    if (!ym || ym.length !== 7) continue;
    map.set(ym, (map.get(ym) ?? 0) + Number(e.amount || 0));
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, total]) => ({ ym, label: monthLabel(ym), total: Math.round(total) }));
}
