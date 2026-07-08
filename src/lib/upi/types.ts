export interface AppMonthData {
  app_name: string;
  app_name_raw: string;
  year: number;
  month: string;
  month_num: number;
  cit_volume_mn: number;
  cit_value_cr: number;
  /** Domain used for logo resolution (from upi_apps.logo_domain). Null for unmapped apps. */
  logo_domain?: string | null;
}

export interface TableRow extends AppMonthData {
  rank: number;
  pct_change: number | null;
  market_share: number;
}

export interface TrendPoint {
  year: number;
  month: string;
  month_num: number;
  label: string;
  cit_volume_mn: number;
  cit_value_cr: number;
}

export type Metric = "volume" | "value";
export type MapMetric = "volume" | "value" | "txnsPerCapita" | "spendsPerCapita";

export interface StatewiseTrendPoint {
  year: number;
  month: string;
  month_num: number;
  label: string;
  volume_in_mn: number;
  value_in_cr: number;
  mom_volume_pct: number | null;
  mom_value_pct: number | null;
}

export interface StatewiseRow {
  year: number;
  month: string;
  month_num: number;
  state_union_territory: string;
  /** Empty string for statewise/total rows; district name for district-level rows. */
  district: string;
  volume_in_mn: number;
  value_in_cr: number;
  volume_contribution: number;
  value_contribution: number;
}

/** One merchant-category row for a single month (joined from upi_mcc_data + upi_mcc_codes). */
export interface MccRow {
  mcc: string;
  /** NPCI transacting tier, e.g. "High Transacting Categories". */
  type: string;
  description: string;
  year: number;
  month: string;
  month_num: number;
  volume_mn: number;
  value_cr: number;
}

export interface CircularActionItem {
  action: string;
  owner: string;
  deadline: string | null;
}

/** Structured "smart summary" payload — see docs/circular-smart-summary-plan.md. */
export interface CircularSummary {
  tldr: string;
  category: string;
  audience: string[];
  effective_date: string | null;
  action_items: CircularActionItem[];
  references: string[];
  supersedes_note: string | null;
}

/** One row from npci_circulars — an official NPCI UPI operating circular. */
export interface CircularRow {
  id: number;
  npci_id: number;
  oc_number: string | null;
  oc_base: string | null;
  /** Human-readable title parsed from the "Subject:" line of the OCR'd body. */
  oc_name: string | null;
  file_name: string;
  doc_reference: string | null;
  doc_date: string | null;
  query_year: number;
  ocr_status: "pending" | "done" | "failed";
  /**
   * Full OCR'd text. Selected on the detail page and present in the search
   * corpus (circularsSearch.ts); deliberately NOT selected on the paginated
   * list so browse pages stay small.
   */
  content_text?: string | null;
  storage_path: string | null;
  /** Original NPCI URL of the PDF. */
  source_url: string | null;
  /** Full structured summary — only selected on the detail-page fetch. */
  summary?: CircularSummary | null;
  summary_model?: string | null;
  summary_at?: string | null;
  summary_status?: "pending" | "done" | "failed" | "skipped";
  /** Scoped summary key selected on the list page (keep paginated payload small). */
  summary_action_items?: CircularActionItem[] | null;
  /**
   * When the row was first inserted (drives the 30-day "New" badge). Set by
   * the DB default on insert only — the fetch script's upsert must never
   * include this column (see scripts/fetch_npci_circulars.mjs) or every
   * re-fetch would reset it. Selected on the list query and in the search
   * corpus; absent on the detail fetch.
   */
  created_at?: string | null;
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const MONTH_TO_NUM: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export const NUM_TO_MONTH: Record<number, string> = Object.fromEntries(
  Object.entries(MONTH_TO_NUM).map(([k, v]) => [v, k]),
);
