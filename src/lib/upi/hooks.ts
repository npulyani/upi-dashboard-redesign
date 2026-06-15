import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  allMonthsQuery,
  eventsQuery,
  mccDataQuery,
  monthDataQuery,
  MonthBucket,
  p2pmQuery,
  populationsQuery,
  statesQuery,
  statewiseQuery,
  statewiseTrendQuery,
} from "./queryOptions";
import { AVAILABLE_MONTHS, LATEST_MONTH } from "./queries";
import { buildSeasonalityMatrix } from "./insights";
import { AppMonthData, MccRow, Metric, TrendPoint } from "./types";

const EMPTY_MONTHS: MonthBucket[] = [];
const EMPTY_ROWS: AppMonthData[] = [];
const EMPTY_MCC: MccRow[] = [];

/** Full history (one paginated fetch, shared by every consumer). */
export function useAllMonths() {
  const { data, isPending } = useQuery(allMonthsQuery());
  return { allMonths: data ?? EMPTY_MONTHS, isPending };
}

/**
 * One month of app data. Small standalone query so first paint doesn't wait
 * for the full history; React Query dedupes it across routes.
 */
export function useMonthData(year: number | null, month: string | null) {
  const { data, isPending } = useQuery({
    ...monthDataQuery(year ?? 0, month ?? "Jan"),
    enabled: year !== null && month !== null,
  });
  return { rows: data ?? EMPTY_ROWS, isPending };
}

export function useStatewise(year: number, month: string) {
  const { data } = useQuery(statewiseQuery(year, month));
  return data ?? [];
}

export function useStatewiseTrend(state: string | null) {
  const { data } = useQuery({
    ...statewiseTrendQuery(state ?? ""),
    enabled: !!state,
  });
  return data ?? [];
}

export function useStates() {
  const { data } = useQuery(statesQuery());
  return data ?? [];
}

export function usePopulations() {
  const { data } = useQuery(populationsQuery());
  return data ?? null;
}

export function useMarketEvents() {
  const { data } = useQuery(eventsQuery());
  return data ?? [];
}

export function useP2PM() {
  const { data, isPending } = useQuery(p2pmQuery());
  return { data: data ?? [], isPending };
}

/** Full merchant-category history (one paginated fetch, shared by every consumer). */
export function useMccData() {
  const { data, isPending } = useQuery(mccDataQuery());
  return { mccRows: data ?? EMPTY_MCC, isPending };
}

// ── Pure derivations over the in-memory history ──────────────────────────────

function windowOf(monthsBack: number, endYear: number, endMonth: string) {
  const endIdx = AVAILABLE_MONTHS.findIndex((m) => m.year === endYear && m.month === endMonth);
  if (endIdx < 0) return [];
  return AVAILABLE_MONTHS.slice(Math.max(0, endIdx - monthsBack + 1), endIdx + 1);
}

function bucketMap(allMonths: MonthBucket[]) {
  return new Map(allMonths.map((b) => [`${b.year}-${b.month_num}`, b.rows]));
}

/** Replaces getAppTrend(): derives a per-app series from the loaded history. */
export function appTrendFrom(
  allMonths: MonthBucket[],
  appName: string,
  monthsBack = 24,
  endYear = LATEST_MONTH.year,
  endMonth = LATEST_MONTH.month,
): TrendPoint[] {
  const buckets = bucketMap(allMonths);
  return windowOf(monthsBack, endYear, endMonth).map((m) => {
    const row = buckets.get(`${m.year}-${m.month_num}`)?.find((r) => r.app_name === appName);
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

/** Replaces getMultiAppTrend(): chart-ready rows for several apps at once. */
export function multiAppTrendFrom(
  allMonths: MonthBucket[],
  appNames: string[],
  monthsBack = 24,
  endYear = LATEST_MONTH.year,
  endMonth = LATEST_MONTH.month,
): Record<string, number | string>[] {
  const buckets = bucketMap(allMonths);
  return windowOf(monthsBack, endYear, endMonth).map((m) => {
    const rows = buckets.get(`${m.year}-${m.month_num}`) ?? [];
    const byApp = new Map(rows.map((r) => [r.app_name, r]));
    const row: Record<string, number | string> = {
      label: `${m.month} '${String(m.year).slice(2)}`,
      year: m.year,
      month: m.month,
    };
    for (const app of appNames) {
      const match = byApp.get(app);
      row[app] = match?.cit_volume_mn ?? 0;
      row[`${app}__value`] = match?.cit_value_cr ?? 0;
    }
    return row;
  });
}

/** Apps seen in the most recent 6 months of the history. */
export function useUniqueApps(): string[] {
  const { allMonths } = useAllMonths();
  return useMemo(() => {
    const apps = new Set<string>();
    for (const bucket of allMonths.slice(-6)) {
      for (const r of bucket.rows) apps.add(r.app_name);
    }
    return Array.from(apps).sort();
  }, [allMonths]);
}

/**
 * Seasonality matrix, computed once per (metric, app) from the shared history.
 * Every route that needs it converges on the same React Query cache entry.
 */
export function useSeasonalityMatrix(metric: Metric, app?: string) {
  const { allMonths } = useAllMonths();
  return useMemo(
    () => (allMonths.length ? buildSeasonalityMatrix(allMonths, metric, app) : []),
    [allMonths, metric, app],
  );
}
