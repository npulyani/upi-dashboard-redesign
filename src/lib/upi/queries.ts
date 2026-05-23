import { AppMonthData, MONTH_TO_NUM, NUM_TO_MONTH, TrendPoint } from "./types";

// Generate available months: Jan 2021 → Mar 2026 (matches dataset)
function generateAvailableMonths(): { year: number; month: string; month_num: number }[] {
  const out: { year: number; month: string; month_num: number }[] = [];
  for (let y = 2021; y <= 2026; y++) {
    const lastMonth = y === 2026 ? 3 : 12;
    for (let m = 1; m <= lastMonth; m++) {
      out.push({ year: y, month: NUM_TO_MONTH[m], month_num: m });
    }
  }
  return out;
}

export const AVAILABLE_MONTHS = generateAvailableMonths();
export const LATEST_MONTH = AVAILABLE_MONTHS[AVAILABLE_MONTHS.length - 1];

const cache = new Map<string, AppMonthData[]>();

export async function getMonthData(year: number, month: string): Promise<AppMonthData[]> {
  const key = `${year}-${month}`;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const res = await fetch(`/data/${year}-${month}.json`);
    if (!res.ok) return [];
    const raw = (await res.json()) as AppMonthData[];
    const data = raw.filter((r) => r.app_name && r.cit_volume_mn > 0);
    cache.set(key, data);
    return data;
  } catch {
    return [];
  }
}

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

export async function getAppTrend(
  appName: string,
  monthsBack = 24,
  endYear = LATEST_MONTH.year,
  endMonth = LATEST_MONTH.month,
): Promise<TrendPoint[]> {
  const endIdx = AVAILABLE_MONTHS.findIndex(
    (m) => m.year === endYear && m.month === endMonth,
  );
  const startIdx = Math.max(0, endIdx - monthsBack + 1);
  const window = AVAILABLE_MONTHS.slice(startIdx, endIdx + 1);
  const all = await Promise.all(window.map((m) => getMonthData(m.year, m.month)));
  return window.map((m, i) => {
    const row = all[i].find((r) => r.app_name === appName);
    return {
      year: m.year,
      month: m.month,
      month_num: m.month_num,
      label: `${m.month} '${String(m.year).slice(2)}`,
      cit_volume_mn: row?.cit_volume_mn ?? 0,
      cit_value_cr: row?.cit_value_cr ?? 0,
    };
  });
}

export async function getMultiAppTrend(
  appNames: string[],
  monthsBack = 24,
  endYear = LATEST_MONTH.year,
  endMonth = LATEST_MONTH.month,
): Promise<Record<string, number | string>[]> {
  const endIdx = AVAILABLE_MONTHS.findIndex(
    (m) => m.year === endYear && m.month === endMonth,
  );
  const startIdx = Math.max(0, endIdx - monthsBack + 1);
  const window = AVAILABLE_MONTHS.slice(startIdx, endIdx + 1);
  const all = await Promise.all(window.map((m) => getMonthData(m.year, m.month)));
  return window.map((m, i) => {
    const row: Record<string, number | string> = {
      label: `${m.month} '${String(m.year).slice(2)}`,
      year: m.year,
      month: m.month,
    };
    for (const app of appNames) {
      const match = all[i].find((r) => r.app_name === app);
      row[app] = match?.cit_volume_mn ?? 0;
      row[`${app}__value`] = match?.cit_value_cr ?? 0;
    }
    return row;
  });
}

export async function getUniqueApps(): Promise<string[]> {
  const recent = AVAILABLE_MONTHS.slice(-6);
  const sets = await Promise.all(recent.map((m) => getMonthData(m.year, m.month)));
  const apps = new Set<string>();
  sets.flat().forEach((r) => apps.add(r.app_name));
  return Array.from(apps).sort();
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
