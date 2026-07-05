import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  allMonthsQuery,
  eventsQuery,
  latestMonthQuery,
  mccDataQuery,
  monthDataQuery,
  MonthBucket,
  p2pmQuery,
  populationsQuery,
  statesQuery,
  statewiseQuery,
  statewiseTrendQuery,
} from "./queryOptions";
import {
  circularFamilyIndexQuery,
  circularQuery,
  circularsInfiniteQuery,
  circularYearsQuery,
  CircularFamilyMember,
  SearchQuery,
} from "./circularsQueryOptions";
import { circularsSearchEngineQuery } from "./circularsSearch";
import { AvailableMonth, buildAvailableMonths, STATIC_AVAILABLE_MONTHS, STATIC_LATEST_MONTH } from "./queries";
import { buildSeasonalityMatrix } from "./insights";
import { AppMonthData, CircularRow, MccRow, Metric, TrendPoint } from "./types";

const EMPTY_MONTHS: MonthBucket[] = [];
const EMPTY_ROWS: AppMonthData[] = [];
const EMPTY_MCC: MccRow[] = [];
const EMPTY_CIRCULARS: CircularRow[] = [];
const EMPTY_YEARS: number[] = [];

/** Full history (one paginated fetch, shared by every consumer). */
export function useAllMonths() {
  const { data, isPending } = useQuery(allMonthsQuery());
  return { allMonths: data ?? EMPTY_MONTHS, isPending };
}

/**
 * Available months (Jan 2021 → latest ingested), driven by the DB's max
 * (year, month_num) instead of a hardcoded bound. Falls back to the static
 * calendar — matching the last month this file was hand-updated for — until
 * the query resolves or if it errors, so the app always renders something.
 */
export function useAvailableMonths(): { availableMonths: AvailableMonth[]; latestMonth: AvailableMonth } {
  const { data: latest } = useQuery(latestMonthQuery());
  return useMemo(() => {
    const availableMonths = latest ? buildAvailableMonths(latest) : STATIC_AVAILABLE_MONTHS;
    return { availableMonths, latestMonth: availableMonths[availableMonths.length - 1] };
  }, [latest]);
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

/** Paginated NPCI circulars, refetching from page 0 whenever year/search/category change. */
export function useCircularsInfinite(
  year: number | null,
  search: SearchQuery | null,
  category: string | null = null,
  enabled = true,
) {
  const query = useInfiniteQuery({ ...circularsInfiniteQuery(year, search, category), enabled });
  const rows = useMemo(() => query.data?.pages.flat() ?? EMPTY_CIRCULARS, [query.data]);
  return { rows, ...query };
}

/**
 * In-browser keyword search over the circulars corpus. The engine downloads
 * lazily (pass enabled=true once the user shows search intent) and every
 * search afterwards is a synchronous in-memory lookup — no DB round-trips.
 */
export function useCircularsSearch(
  term: string,
  year: number | null,
  category: string | null,
  enabled: boolean,
) {
  const { data: engine, isError } = useQuery({ ...circularsSearchEngineQuery(), enabled });
  const rows = useMemo(
    () => (engine && term ? engine.search(term, { year, category }) : EMPTY_CIRCULARS),
    [engine, term, year, category],
  );
  return { rows, isLoadingEngine: enabled && !!term && !engine && !isError, isError };
}

export function useCircularYears() {
  const { data } = useQuery(circularYearsQuery());
  return data ?? EMPTY_YEARS;
}

export interface CircularFamily {
  /** oc_number -> that row's own metadata (used to resolve a parent's title from an addendum). */
  byOcNumber: Map<string, CircularFamilyMember>;
  /** oc_base -> its addenda (excludes the primary itself). */
  addendaByBase: Map<string, CircularFamilyMember[]>;
}
const EMPTY_FAMILY: CircularFamily = { byOcNumber: new Map(), addendaByBase: new Map() };

/**
 * Lightweight oc_number/oc_base index shared by the list page (addenda
 * badges) and the detail page (parent/addenda cross-reference) — one query,
 * built into two lookup directions.
 */
export function useCircularFamily(): CircularFamily {
  const { data } = useQuery(circularFamilyIndexQuery());
  return useMemo(() => {
    if (!data) return EMPTY_FAMILY;
    const byOcNumber = new Map<string, CircularFamilyMember>();
    const addendaByBase = new Map<string, CircularFamilyMember[]>();
    for (const r of data) {
      byOcNumber.set(r.oc_number, r);
      if (r.oc_number === r.oc_base) continue;
      const list = addendaByBase.get(r.oc_base);
      if (list) list.push(r);
      else addendaByBase.set(r.oc_base, [r]);
    }
    return { byOcNumber, addendaByBase };
  }, [data]);
}

export function useCircular(ocNumber: string) {
  const { data, isPending } = useQuery({ ...circularQuery(ocNumber), enabled: !!ocNumber });
  return { circular: data ?? null, isPending };
}

// ── Pure derivations over the in-memory history ──────────────────────────────

// The window is sliced from the fetched history itself (not a separate
// calendar array), so it always matches whatever months are actually loaded.
function windowOf(allMonths: MonthBucket[], monthsBack: number, endYear: number, endMonth: string) {
  const endIdx = allMonths.findIndex((m) => m.year === endYear && m.month === endMonth);
  if (endIdx < 0) return [];
  return allMonths.slice(Math.max(0, endIdx - monthsBack + 1), endIdx + 1);
}

/** Replaces getAppTrend(): derives a per-app series from the loaded history. */
export function appTrendFrom(
  allMonths: MonthBucket[],
  appName: string,
  monthsBack = 24,
  endYear = STATIC_LATEST_MONTH.year,
  endMonth = STATIC_LATEST_MONTH.month,
): TrendPoint[] {
  return windowOf(allMonths, monthsBack, endYear, endMonth).map((m) => {
    const row = m.rows.find((r) => r.app_name === appName);
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
  endYear = STATIC_LATEST_MONTH.year,
  endMonth = STATIC_LATEST_MONTH.month,
): Record<string, number | string>[] {
  return windowOf(allMonths, monthsBack, endYear, endMonth).map((m) => {
    const rows = m.rows;
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
