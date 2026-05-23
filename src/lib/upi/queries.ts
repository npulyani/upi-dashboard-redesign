import { supabase } from "../supabase";
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

  const { data, error } = await supabase
    .from("upi_monthly_data")
    .select("app_name_raw, year, month, month_num, cit_volume_mn, cit_value_cr, upi_apps(canonical_name, logo_domain)")
    .eq("year", year)
    .eq("month", month)
    .gt("cit_volume_mn", 0);

  if (error || !data) return [];

  const rows: AppMonthData[] = data
    .filter((r) => r.app_name_raw)
    .map((r) => {
      const appInfo = r.upi_apps as unknown as { canonical_name: string; logo_domain?: string | null } | null;
      return {
        app_name: appInfo?.canonical_name ?? r.app_name_raw,
        app_name_raw: r.app_name_raw,
        year: r.year,
        month: r.month,
        month_num: r.month_num,
        cit_volume_mn: r.cit_volume_mn,
        cit_value_cr: r.cit_value_cr,
        logo_domain: appInfo?.logo_domain ?? null,
      };
    });

  cache.set(key, rows);
  return rows;
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
