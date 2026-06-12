import { MONTH_TO_NUM, NUM_TO_MONTH } from "./types";

// Pure month-window utilities and formatters. All data fetching lives in
// queryOptions.ts (React Query) and derivations in hooks.ts.

// Generate available months: Jan 2021 → May 2026 (matches dataset)
function generateAvailableMonths(): { year: number; month: string; month_num: number }[] {
  const out: { year: number; month: string; month_num: number }[] = [];
  for (let y = 2021; y <= 2026; y++) {
    const lastMonth = y === 2026 ? 5 : 12;
    for (let m = 1; m <= lastMonth; m++) {
      out.push({ year: y, month: NUM_TO_MONTH[m], month_num: m });
    }
  }
  return out;
}

export const AVAILABLE_MONTHS = generateAvailableMonths();
export const LATEST_MONTH = AVAILABLE_MONTHS[AVAILABLE_MONTHS.length - 1];

export function getPreviousMonth(year: number, month: string) {
  const monthNum = MONTH_TO_NUM[month];
  const idx = AVAILABLE_MONTHS.findIndex((m) => m.year === year && m.month_num === monthNum);
  if (idx <= 0) return null;
  return AVAILABLE_MONTHS[idx - 1];
}

export function getMonthOffset(year: number, month: string, offset: number) {
  const monthNum = MONTH_TO_NUM[month];
  const idx = AVAILABLE_MONTHS.findIndex((m) => m.year === year && m.month_num === monthNum);
  if (idx < 0) return null;
  const target = idx - offset;
  if (target < 0) return null;
  return AVAILABLE_MONTHS[target];
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
