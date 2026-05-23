export interface AppMonthData {
  app_name: string;
  app_name_raw: string;
  year: number;
  month: string;
  month_num: number;
  cit_volume_mn: number;
  cit_value_cr: number;
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
