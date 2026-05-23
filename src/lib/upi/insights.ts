import { AppMonthData, Metric } from "./types";
import { formatIndianNumber, formatNumber } from "./queries";

export function pickMetric(
  r: { cit_volume_mn: number; cit_value_cr: number },
  metric: Metric,
) {
  return metric === "volume" ? r.cit_volume_mn : r.cit_value_cr;
}

export function totalFor(rows: AppMonthData[], metric: Metric) {
  return rows.reduce((a, b) => a + pickMetric(b, metric), 0);
}

export function ranked(rows: AppMonthData[], metric: Metric) {
  return [...rows].sort((a, b) => pickMetric(b, metric) - pickMetric(a, metric));
}

export function rankMap(rows: AppMonthData[], metric: Metric): Map<string, number> {
  const m = new Map<string, number>();
  ranked(rows, metric).forEach((r, i) => m.set(r.app_name, i + 1));
  return m;
}

/** Returns rank-delta entries (positive = climbed, negative = fell) */
export function rankChanges(
  current: AppMonthData[],
  previous: AppMonthData[],
  metric: Metric,
) {
  const curR = rankMap(current, metric);
  const prevR = rankMap(previous, metric);
  const out: { app: string; current: number; previous: number; delta: number }[] = [];
  curR.forEach((cr, app) => {
    const pr = prevR.get(app);
    if (pr === undefined) return;
    out.push({ app, current: cr, previous: pr, delta: pr - cr });
  });
  return out;
}

/** Herfindahl-Hirschman Index — sum of squared market shares (0-10000) */
export function computeHHI(rows: AppMonthData[], metric: Metric): number {
  const total = totalFor(rows, metric);
  if (!total) return 0;
  return rows.reduce((acc, r) => {
    const share = (pickMetric(r, metric) / total) * 100;
    return acc + share * share;
  }, 0);
}

/** Avg ticket size in ₹ per transaction */
export function avgTicket(r: AppMonthData): number {
  if (!r.cit_volume_mn) return 0;
  // value_cr * 1e7 / (volume_mn * 1e6) = value/volume * 10
  return (r.cit_value_cr * 1e7) / (r.cit_volume_mn * 1e6);
}

/** CAGR % between two values across n years */
export function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

export function findPeak(history: { label: string; value: number }[]) {
  if (!history.length) return null;
  let peak = history[0];
  for (const p of history) if (p.value > peak.value) peak = p;
  return peak;
}

export function formatMetricValue(value: number, metric: Metric): string {
  return metric === "volume"
    ? `${formatNumber(value * 1e6, 1)}`
    : `₹${formatIndianNumber(value)} Cr`;
}

export function generateNarrative(
  month: string,
  year: number,
  current: AppMonthData[],
  previous: AppMonthData[],
  metric: Metric,
): string {
  if (!current.length) return "";
  const sorted = ranked(current, metric);
  const total = totalFor(current, metric);
  const prevTotal = totalFor(previous, metric);
  const ecosystemMoM = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : 0;
  const top3Share = sorted
    .slice(0, 3)
    .reduce((a, b) => a + pickMetric(b, metric), 0);
  const top3Pct = total ? (top3Share / total) * 100 : 0;

  const leader = sorted[0];
  const prevMap = new Map(previous.map((r) => [r.app_name, r]));
  const movers = sorted
    .map((r) => {
      const p = prevMap.get(r.app_name);
      if (!p) return null;
      const c = pickMetric(r, metric);
      const pv = pickMetric(p, metric);
      if (pv <= 0) return null;
      return { app: r.app_name, pct: ((c - pv) / pv) * 100, abs: c };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const leaderMoM = movers.find((m) => m.app === leader?.app_name);
  // Fastest challenger = highest pct outside top 3
  const challengers = movers.filter((m) => !sorted.slice(0, 3).find((s) => s.app_name === m.app));
  const fastest = [...challengers].sort((a, b) => b.pct - a.pct)[0];

  const totalDisplay =
    metric === "volume"
      ? `${(total / 1000).toFixed(2)}B transactions`
      : `₹${(total / 100000).toFixed(2)} lakh crore`;

  const parts: string[] = [];
  parts.push(
    `In ${month} ${year}, the top 3 apps controlled ${top3Pct.toFixed(1)}% of ${
      metric === "volume" ? "transaction volume" : "transaction value"
    }.`,
  );
  if (leader && leaderMoM) {
    const verb = leaderMoM.pct >= 0 ? "extended its lead with" : "slipped";
    parts.push(
      `${leader.app_name} ${verb} ${leaderMoM.pct >= 0 ? "+" : ""}${leaderMoM.pct.toFixed(1)}% MoM${
        fastest ? `, while ${fastest.app} grew fastest among challengers at +${fastest.pct.toFixed(1)}%` : ""
      }.`,
    );
  }
  parts.push(
    `The ecosystem processed ${totalDisplay} — ${
      ecosystemMoM >= 0 ? "up" : "down"
    } ${Math.abs(ecosystemMoM).toFixed(1)}% from last month.`,
  );
  return parts.join(" ");
}
