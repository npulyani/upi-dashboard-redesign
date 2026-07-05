import { MONTH_TO_NUM, NUM_TO_MONTH } from "./types";

// Pure month-window utilities and formatters. All data fetching lives in
// queryOptions.ts (React Query) and derivations in hooks.ts.

export interface AvailableMonth {
  year: number;
  month: string;
  month_num: number;
}

// Static fallback bound, used only until the DB-driven latest month resolves
// (see latestMonthQuery in queryOptions.ts) or if that query fails.
const FALLBACK_LATEST = { year: 2026, month_num: 5 };

/** Jan 2021 → latest (inclusive). Defaults to the static fallback bound. */
export function buildAvailableMonths(
  latest: { year: number; month_num: number } = FALLBACK_LATEST,
): AvailableMonth[] {
  const out: AvailableMonth[] = [];
  for (let y = 2021; y <= latest.year; y++) {
    const lastMonth = y === latest.year ? latest.month_num : 12;
    for (let m = 1; m <= lastMonth; m++) {
      out.push({ year: y, month: NUM_TO_MONTH[m], month_num: m });
    }
  }
  return out;
}

export const STATIC_AVAILABLE_MONTHS = buildAvailableMonths();
export const STATIC_LATEST_MONTH = STATIC_AVAILABLE_MONTHS[STATIC_AVAILABLE_MONTHS.length - 1];

export function getPreviousMonth(months: AvailableMonth[], year: number, month: string) {
  const monthNum = MONTH_TO_NUM[month];
  const idx = months.findIndex((m) => m.year === year && m.month_num === monthNum);
  if (idx <= 0) return null;
  return months[idx - 1];
}

export function getMonthOffset(months: AvailableMonth[], year: number, month: string, offset: number) {
  const monthNum = MONTH_TO_NUM[month];
  const idx = months.findIndex((m) => m.year === year && m.month_num === monthNum);
  if (idx < 0) return null;
  const target = idx - offset;
  if (target < 0) return null;
  return months[target];
}

export function formatNumber(n: number, digits = 1): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  return n.toFixed(digits);
}

export function formatIndianNumber(n: number): string {
  const s = Math.round(n).toString();
  const lastThree = s.slice(-3);
  const other = s.slice(0, -3);
  if (!other) return lastThree;
  return other.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
}
