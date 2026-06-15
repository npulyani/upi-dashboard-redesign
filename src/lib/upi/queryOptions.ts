import { queryOptions } from "@tanstack/react-query";
import { supabase } from "../supabase";
import {
  AppMonthData,
  MccRow,
  MONTH_TO_NUM,
  StatewiseRow,
  StatewiseTrendPoint,
} from "./types";
import { AVAILABLE_MONTHS } from "./queries";
import { getMarketEvents } from "./events";
import { getStatePopulations } from "./population";

/** One month of app-level data, chronological position included. */
export interface MonthBucket {
  year: number;
  month: string;
  month_num: number;
  rows: AppMonthData[];
}

const HOUR = 60 * 60 * 1000;

// PostgREST caps responses at 1,000 rows; the full-history fetch paginates.
const PAGE_SIZE = 1000;

type RawMonthlyRow = {
  app_name_raw: string;
  year: number;
  month: string;
  month_num: number;
  cit_volume_mn: number;
  cit_value_cr: number;
  upi_apps: { canonical_name: string; logo_domain?: string | null } | null;
};

function mapMonthlyRow(r: RawMonthlyRow): AppMonthData {
  return {
    app_name: r.upi_apps?.canonical_name ?? r.app_name_raw,
    app_name_raw: r.app_name_raw,
    year: r.year,
    month: r.month,
    month_num: r.month_num,
    cit_volume_mn: r.cit_volume_mn,
    cit_value_cr: r.cit_value_cr,
    logo_domain: r.upi_apps?.logo_domain ?? null,
  };
}

// Deduplicate: multiple raw names may share the same canonical app_name
// (e.g. "KreditBee #" and "Kredit Pe #" both resolve to "KreditBee").
// Sum volume + value; keep logo/metadata from the first entry.
function dedupeMonthRows(mapped: AppMonthData[]): AppMonthData[] {
  const deduped = new Map<string, AppMonthData>();
  for (const row of mapped) {
    const existing = deduped.get(row.app_name);
    if (existing) {
      existing.cit_volume_mn += row.cit_volume_mn;
      existing.cit_value_cr += row.cit_value_cr;
    } else {
      deduped.set(row.app_name, { ...row });
    }
  }
  return Array.from(deduped.values());
}

/** Full history in one paginated range query instead of one request per month. */
async function fetchAllMonths(): Promise<MonthBucket[]> {
  const raw: RawMonthlyRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("upi_monthly_data")
      .select(
        "app_name_raw, year, month, month_num, cit_volume_mn, cit_value_cr, upi_apps(canonical_name, logo_domain)",
      )
      .gt("cit_volume_mn", 0)
      .order("year", { ascending: true })
      .order("month_num", { ascending: true })
      .order("app_name_raw", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    raw.push(...(data as unknown as RawMonthlyRow[]));
    if (data.length < PAGE_SIZE) break;
  }

  const byMonth = new Map<string, AppMonthData[]>();
  for (const r of raw) {
    if (!r.app_name_raw) continue;
    const key = `${r.year}-${r.month_num}`;
    let list = byMonth.get(key);
    if (!list) byMonth.set(key, (list = []));
    list.push(mapMonthlyRow(r));
  }

  // Every available month gets a bucket (possibly empty), matching the shape
  // the old getAllMonthsData() returned.
  return AVAILABLE_MONTHS.map((m) => ({
    year: m.year,
    month: m.month,
    month_num: m.month_num,
    rows: dedupeMonthRows(byMonth.get(`${m.year}-${m.month_num}`) ?? []),
  }));
}

async function fetchMonthData(year: number, month: string): Promise<AppMonthData[]> {
  const { data, error } = await supabase
    .from("upi_monthly_data")
    .select(
      "app_name_raw, year, month, month_num, cit_volume_mn, cit_value_cr, upi_apps(canonical_name, logo_domain)",
    )
    .eq("year", year)
    .eq("month_num", MONTH_TO_NUM[month])
    .gt("cit_volume_mn", 0);
  if (error || !data) return [];
  return dedupeMonthRows(
    (data as unknown as RawMonthlyRow[]).filter((r) => r.app_name_raw).map(mapMonthlyRow),
  );
}

async function fetchStatewiseData(year: number, month: string): Promise<StatewiseRow[]> {
  const monthNum = MONTH_TO_NUM[month];
  const { data, error } = await supabase
    .from("upi_statewise_data")
    .select(
      "year, month, month_num, state_union_territory, district, volume_in_mn, value_in_cr, volume_contribution, value_contribution",
    )
    .eq("year", year)
    .eq("month", month)
    .order("volume_in_mn", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    year: r.year,
    month: r.month,
    month_num: r.month_num ?? monthNum,
    state_union_territory: r.state_union_territory,
    district: r.district ?? "",
    volume_in_mn: Number(r.volume_in_mn),
    value_in_cr: Number(r.value_in_cr),
    volume_contribution: Number(r.volume_contribution),
    value_contribution: Number(r.value_contribution),
  }));
}

async function fetchStatewiseTrend(stateName: string): Promise<StatewiseTrendPoint[]> {
  const { data, error } = await supabase
    .from("upi_statewise_data")
    .select("year, month, month_num, volume_in_mn, value_in_cr")
    .eq("state_union_territory", stateName)
    .eq("district", "")
    .order("year", { ascending: true })
    .order("month_num", { ascending: true });
  if (error || !data) return [];
  return data.map((r, i) => {
    const prev = data[i - 1];
    const vol = Number(r.volume_in_mn);
    const val = Number(r.value_in_cr);
    const prevVol = prev ? Number(prev.volume_in_mn) : 0;
    const prevVal = prev ? Number(prev.value_in_cr) : 0;
    return {
      year: r.year,
      month: r.month,
      month_num: r.month_num,
      label: `${r.month} '${String(r.year).slice(2)}`,
      volume_in_mn: vol,
      value_in_cr: val,
      mom_volume_pct: prev && prevVol ? ((vol - prevVol) / prevVol) * 100 : null,
      mom_value_pct: prev && prevVal ? ((val - prevVal) / prevVal) * 100 : null,
    };
  });
}

async function fetchUniqueStates(): Promise<string[]> {
  const { data, error } = await supabase
    .from("upi_statewise_data")
    .select("state_union_territory")
    .eq("district", "")
    .not("state_union_territory", "ilike", "%total%")
    .not("state_union_territory", "ilike", "%unclassified%")
    .order("state_union_territory");
  if (error || !data) return [];
  const seen = new Set<string>();
  for (const r of data) if (r.state_union_territory) seen.add(r.state_union_territory as string);
  return Array.from(seen);
}

export interface P2PMPoint {
  year: number;
  month: string;
  month_num: number;
  label: string;
  total_volume_mn: number;
  total_value_cr: number;
  p2p_volume_mn: number;
  p2p_value_cr: number;
  p2m_volume_mn: number;
  p2m_value_cr: number;
  p2m_volume_pct: number;
  p2m_value_pct: number;
  p2p_ticket: number;
  p2m_ticket: number;
}

async function fetchP2PMData(): Promise<P2PMPoint[]> {
  const { data, error } = await supabase
    .from("upi_p2p_p2m")
    .select(
      "year, month, month_num, total_volume_mn, total_value_cr, p2p_volume_mn, p2p_value_cr, p2m_volume_mn, p2m_value_cr",
    )
    .order("year", { ascending: true })
    .order("month_num", { ascending: true });
  if (error || !data || data.length === 0) return [];
  return data.map((r) => {
    const totVol = Number(r.total_volume_mn);
    const totVal = Number(r.total_value_cr);
    const p2pVol = Number(r.p2p_volume_mn);
    const p2pVal = Number(r.p2p_value_cr);
    const p2mVol = Number(r.p2m_volume_mn);
    const p2mVal = Number(r.p2m_value_cr);
    // Guard against NPCI total anomalies (e.g. Aug '23 total_value_cr is ~10× too low).
    // Use the max of reported total and sum of components so percentages stay ≤ 100%.
    const effVol = Math.max(totVol, p2pVol + p2mVol);
    const effVal = Math.max(totVal, p2pVal + p2mVal);
    return {
      year: r.year,
      month: r.month,
      month_num: r.month_num,
      label: `${r.month} '${String(r.year).slice(2)}`,
      total_volume_mn: totVol,
      total_value_cr: totVal,
      p2p_volume_mn: p2pVol,
      p2p_value_cr: p2pVal,
      p2m_volume_mn: p2mVol,
      p2m_value_cr: p2mVal,
      p2m_volume_pct: effVol > 0 ? (p2mVol / effVol) * 100 : 0,
      p2m_value_pct: effVal > 0 ? (p2mVal / effVal) * 100 : 0,
      p2p_ticket: p2pVol > 0 ? (p2pVal / p2pVol) * 10 : 0,
      p2m_ticket: p2mVol > 0 ? (p2mVal / p2mVol) * 10 : 0,
    };
  });
}

type RawMccRow = {
  year: number;
  month: string;
  month_num: number;
  volume_mn: number | null;
  value_cr: number | null;
  upi_mcc_codes: { mcc: string; type: string; description: string } | null;
};

/** Full MCC history in one paginated query, joined to the code dimension table. */
async function fetchMccData(): Promise<MccRow[]> {
  const raw: RawMccRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("upi_mcc_data")
      .select(
        "year, month, month_num, volume_mn, value_cr, upi_mcc_codes(mcc, type, description)",
      )
      .order("year", { ascending: true })
      .order("month_num", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    raw.push(...(data as unknown as RawMccRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return raw
    .filter((r) => r.upi_mcc_codes)
    .map((r) => ({
      mcc: r.upi_mcc_codes!.mcc,
      type: r.upi_mcc_codes!.type,
      description: r.upi_mcc_codes!.description,
      year: r.year,
      month: r.month,
      month_num: r.month_num,
      volume_mn: Number(r.volume_mn ?? 0),
      value_cr: Number(r.value_cr ?? 0),
    }));
}

// ── Query options ────────────────────────────────────────────────────────────
// All keys rooted at "upi" so the whole data layer can be invalidated at once.
// Data updates once a month, so long stale times are safe.

export const allMonthsQuery = () =>
  queryOptions({
    queryKey: ["upi", "months", "all"],
    queryFn: fetchAllMonths,
    staleTime: HOUR,
    gcTime: 24 * HOUR,
  });

export const monthDataQuery = (year: number, month: string) =>
  queryOptions({
    queryKey: ["upi", "month", year, MONTH_TO_NUM[month]],
    queryFn: () => fetchMonthData(year, month),
    staleTime: HOUR,
  });

export const statewiseQuery = (year: number, month: string) =>
  queryOptions({
    queryKey: ["upi", "statewise", year, MONTH_TO_NUM[month]],
    queryFn: () => fetchStatewiseData(year, month),
    staleTime: HOUR,
  });

export const statewiseTrendQuery = (state: string) =>
  queryOptions({
    queryKey: ["upi", "statewiseTrend", state],
    queryFn: () => fetchStatewiseTrend(state),
    staleTime: HOUR,
  });

export const statesQuery = () =>
  queryOptions({
    queryKey: ["upi", "states"],
    queryFn: fetchUniqueStates,
    staleTime: 24 * HOUR,
  });

export const populationsQuery = () =>
  queryOptions({
    queryKey: ["upi", "populations"],
    queryFn: getStatePopulations,
    staleTime: 24 * HOUR,
  });

export const eventsQuery = () =>
  queryOptions({
    queryKey: ["upi", "events"],
    queryFn: getMarketEvents,
    staleTime: 24 * HOUR,
  });

export const p2pmQuery = () =>
  queryOptions({
    queryKey: ["upi", "p2pm"],
    queryFn: fetchP2PMData,
    staleTime: HOUR,
  });

export const mccDataQuery = () =>
  queryOptions({
    queryKey: ["upi", "mcc"],
    queryFn: fetchMccData,
    staleTime: HOUR,
    gcTime: 24 * HOUR,
  });
