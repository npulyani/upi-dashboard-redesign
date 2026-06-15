import { MccRow, Metric } from "./types";

/** NPCI transacting tiers, in display order, with short labels and chart colors. */
export const MCC_TIERS = [
  { type: "High Transacting Categories", label: "High", color: "var(--color-chart-3)" },
  { type: "Medium Transacting Categories", label: "Medium", color: "var(--color-chart-1)" },
  { type: "All Other Categories", label: "Other", color: "var(--color-muted-foreground)" },
] as const;

const TIER_COLOR = new Map<string, string>(MCC_TIERS.map((t) => [t.type, t.color]));
const TIER_LABEL = new Map<string, string>(MCC_TIERS.map((t) => [t.type, t.label]));
const TIER_ORDER = new Map<string, number>(MCC_TIERS.map((t, i) => [t.type, i]));

export function tierColor(type: string): string {
  return TIER_COLOR.get(type) ?? "var(--color-muted-foreground)";
}

export function tierLabel(type: string): string {
  return TIER_LABEL.get(type) ?? type;
}

export function tierRank(type: string): number {
  return TIER_ORDER.get(type) ?? MCC_TIERS.length;
}

export function pickMccMetric(r: MccRow, metric: Metric): number {
  return metric === "volume" ? r.volume_mn : r.value_cr;
}

/** Average ticket size in ₹ per transaction. value_cr·1e7 / (volume_mn·1e6) = value/volume·10. */
export function mccTicket(r: MccRow): number {
  if (!r.volume_mn) return 0;
  return (r.value_cr * 1e7) / (r.volume_mn * 1e6);
}

/** The most recent (year, month) present in the dataset. */
export function latestMccMonth(rows: MccRow[]): { year: number; month: string } | null {
  let best: MccRow | null = null;
  for (const r of rows) {
    if (!best || r.year * 100 + r.month_num > best.year * 100 + best.month_num) best = r;
  }
  return best ? { year: best.year, month: best.month } : null;
}

/** Category rows for a single month, excluding the "Others" catch-all bucket. */
export function mccForMonth(
  rows: MccRow[],
  year: number,
  month: string,
  includeOthers = true,
): MccRow[] {
  return rows.filter(
    (r) => r.year === year && r.month === month && (includeOthers || r.mcc !== "Others"),
  );
}

/** A 12-month value series (chosen metric) for one category, ending at the given month. */
export function mccTrendFrom(
  rows: MccRow[],
  description: string,
  metric: Metric,
  monthsBack = 24,
): { label: string; value: number }[] {
  const series = rows
    .filter((r) => r.description === description)
    .sort((a, b) => a.year * 100 + a.month_num - (b.year * 100 + b.month_num))
    .map((r) => ({
      label: `${r.month} '${String(r.year).slice(2)}`,
      value: pickMccMetric(r, metric),
    }));
  return series.slice(-monthsBack);
}

/**
 * Per-category premiumness: value share ÷ volume share within a month.
 * >1 = skews to large-ticket payments; <1 = micro-payments.
 */
export function mccPremiumness(
  monthRows: MccRow[],
): { description: string; mcc: string; index: number; ticket: number }[] {
  const totVol = monthRows.reduce((a, r) => a + r.volume_mn, 0);
  const totVal = monthRows.reduce((a, r) => a + r.value_cr, 0);
  if (!totVol || !totVal) return [];
  return monthRows
    .filter((r) => r.volume_mn > 0 && r.value_cr > 0)
    .map((r) => {
      const volumeShare = (r.volume_mn / totVol) * 100;
      const valueShare = (r.value_cr / totVal) * 100;
      return {
        description: r.description,
        mcc: r.mcc,
        index: valueShare / volumeShare,
        ticket: mccTicket(r),
      };
    })
    .sort((a, b) => b.index - a.index);
}
