import { AppMonthData, Metric, MONTHS } from "./types";
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

/** Decompose ecosystem MoM value growth into volume effect + ticket-size effect */
export function decomposeGrowth(
  current: AppMonthData[],
  previous: AppMonthData[],
): { volumeEffect: number; ticketEffect: number; total: number } | null {
  const curVol = current.reduce((a, b) => a + b.cit_volume_mn, 0);
  const curVal = current.reduce((a, b) => a + b.cit_value_cr, 0);
  const prevVol = previous.reduce((a, b) => a + b.cit_volume_mn, 0);
  const prevVal = previous.reduce((a, b) => a + b.cit_value_cr, 0);
  if (!prevVol || !prevVal) return null;
  const prevTicket = prevVal / prevVol;
  const deltaVol = curVol - prevVol;
  const deltaTicket = curVol > 0 ? curVal / curVol - prevTicket : 0;
  const volumeEffect = deltaVol * prevTicket;
  const ticketEffect = deltaTicket * curVol;
  return { volumeEffect, ticketEffect, total: curVal - prevVal };
}

export interface SeasonalityCell {
  year: number;
  month: string;
  month_num: number;
  mom: number | null;
  delta_from_avg: number | null;
}

/** Build a 2-D matrix of MoM growth % by year × month for the ecosystem or a specific app */
export function buildSeasonalityMatrix(
  allMonthData: { year: number; month: string; month_num: number; rows: AppMonthData[] }[],
  metric: Metric,
  appName?: string,
): SeasonalityCell[][] {
  // Sort chronologically
  const sorted = [...allMonthData].sort(
    (a, b) => a.year * 100 + a.month_num - (b.year * 100 + b.month_num),
  );

  // Compute a value series
  const series = sorted.map((d) => {
    const val = appName
      ? d.rows.find((r) => r.app_name === appName)
      : null;
    const total = appName
      ? (val ? (metric === "volume" ? val.cit_volume_mn : val.cit_value_cr) : null)
      : d.rows.reduce((a, r) => a + (metric === "volume" ? r.cit_volume_mn : r.cit_value_cr), 0);
    return { year: d.year, month: d.month, month_num: d.month_num, total };
  });

  // Compute MoM for each point
  const withMom = series.map((p, i) => {
    const prev = series[i - 1];
    const mom =
      i > 0 && prev && p.total !== null && prev.total !== null && prev.total > 0
        ? ((p.total - prev.total) / prev.total) * 100
        : null;
    return { ...p, mom };
  });

  // Per-month averages across years (ignore nulls)
  const avgByMonthNum: Record<number, number> = {};
  for (let mn = 1; mn <= 12; mn++) {
    const vals = withMom.filter((p) => p.month_num === mn && p.mom !== null).map((p) => p.mom!);
    if (vals.length) avgByMonthNum[mn] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // Group by year
  const years = Array.from(new Set(withMom.map((p) => p.year))).sort();
  return years.map((year) => {
    return MONTHS.map((m, idx) => {
      const mn = idx + 1;
      const point = withMom.find((p) => p.year === year && p.month_num === mn);
      if (!point) return { year, month: m, month_num: mn, mom: null, delta_from_avg: null };
      const avg = avgByMonthNum[mn];
      return {
        year,
        month: m,
        month_num: mn,
        mom: point.mom,
        delta_from_avg: point.mom !== null && avg !== undefined ? point.mom - avg : null,
      };
    });
  });
}

export interface Milestone {
  year: number;
  month: string;
  month_num: number;
  label: string;
  description: string;
  type: "ecosystem" | "app" | "geo";
  app?: string;
}

/** Scan full history and extract significant firsts, records, and streaks */
export function extractMilestones(
  allMonthData: { year: number; month: string; month_num: number; rows: AppMonthData[] }[],
  metric: Metric,
): Milestone[] {
  const sorted = [...allMonthData].sort(
    (a, b) => a.year * 100 + a.month_num - (b.year * 100 + b.month_num),
  );
  if (!sorted.length) return [];

  const milestones: Milestone[] = [];

  // Ecosystem total thresholds
  const volThresholds = [1000, 5000, 10000, 15000, 20000];
  const valThresholds = [100000, 500000, 1000000, 2000000];
  const hitVolThreshold = new Set<number>();
  const hitValThreshold = new Set<number>();

  // App share thresholds
  const shareThresholds = [30, 40, 50, 60];
  const hitShareThreshold = new Map<string, Set<number>>();
  const appFirstMonthMap = new Map<string, { year: number; month: string; month_num: number }>();
  const rankOneHistory: string[] = [];

  // Ecosystem peaks
  const ecosystemPeakVol = { val: 0, month: "", year: 0 };
  const ecosystemPeakVal = { val: 0, month: "", year: 0 };

  // App all-time high trackers
  const appPeakVol = new Map<string, number>();
  const appPeakVal = new Map<string, number>();

  // Rank tracking
  const prevRankMap = new Map<string, number>();

  // Extended trackers
  const top5MonthsCount = new Map<string, number>();
  const top10MonthsCount = new Map<string, number>();
  const enteredTop5Set = new Set<string>();
  const exitedTop5Set = new Set<string>();
  const enteredTop10Set = new Set<string>();
  const exitedTop10Set = new Set<string>();
  const appBestMoM = new Map<string, number>();
  const appWorstMoM = new Map<string, number>();
  const appGrowthStreak = new Map<string, number>();
  const streakMilestonesEmitted = new Map<string, Set<number>>();
  const consecutiveDeclineCount = new Map<string, number>();
  const comebackEmitted = new Set<string>();
  const appPeakEmittedSet = new Set<string>();
  const prevMetricByApp = new Map<string, number>();
  const appSeenMonths = new Map<string, number>();

  for (const d of sorted) {
    const totalVol = d.rows.reduce((a, r) => a + r.cit_volume_mn, 0);
    const totalVal = d.rows.reduce((a, r) => a + r.cit_value_cr, 0);
    const total = metric === "volume" ? totalVol : totalVal;

    // Ecosystem thresholds
    for (const t of volThresholds) {
      if (!hitVolThreshold.has(t) && totalVol >= t) {
        hitVolThreshold.add(t);
        const display = t >= 1000 ? `${(t / 1000).toFixed(0)}B` : `${t}M`;
        milestones.push({
          year: d.year, month: d.month, month_num: d.month_num,
          label: `Ecosystem crossed ${display} transactions`,
          description: `UPI processed over ${display} transactions in a single month for the first time.`,
          type: "ecosystem",
        });
      }
    }
    for (const t of valThresholds) {
      if (!hitValThreshold.has(t) && totalVal >= t) {
        hitValThreshold.add(t);
        const display = t >= 100000 ? `₹${(t / 100000).toFixed(0)} lakh crore` : `₹${t} Cr`;
        milestones.push({
          year: d.year, month: d.month, month_num: d.month_num,
          label: `Ecosystem crossed ${display} in value`,
          description: `UPI processed over ${display} in a single month for the first time.`,
          type: "ecosystem",
        });
      }
    }

    if (totalVol > ecosystemPeakVol.val) { ecosystemPeakVol.val = totalVol; ecosystemPeakVol.month = d.month; ecosystemPeakVol.year = d.year; }
    if (totalVal > ecosystemPeakVal.val) { ecosystemPeakVal.val = totalVal; ecosystemPeakVal.month = d.month; ecosystemPeakVal.year = d.year; }

    const rankedRows = [...d.rows].sort(
      (a, b) => (metric === "volume" ? b.cit_volume_mn - a.cit_volume_mn : b.cit_value_cr - a.cit_value_cr),
    );
    const curRankMap = new Map(rankedRows.map((r, i) => [r.app_name, i + 1]));

    for (const row of d.rows) {
      const v = metric === "volume" ? row.cit_volume_mn : row.cit_value_cr;
      const share = total > 0 ? (v / total) * 100 : 0;
      const app = row.app_name;
      const curRank = curRankMap.get(app) ?? 999;
      const prevRank = prevRankMap.get(app) ?? 999;

      appSeenMonths.set(app, (appSeenMonths.get(app) ?? 0) + 1);
      const seenMonths = appSeenMonths.get(app)!;

      if (!appFirstMonthMap.has(app)) {
        appFirstMonthMap.set(app, { year: d.year, month: d.month, month_num: d.month_num });
      }

      // Share thresholds
      if (!hitShareThreshold.has(app)) hitShareThreshold.set(app, new Set());
      const appHit = hitShareThreshold.get(app)!;
      for (const t of shareThresholds) {
        if (!appHit.has(t) && share >= t) {
          appHit.add(t);
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} crossed ${t}% market share`,
            description: `${app} held ${share.toFixed(1)}% of UPI ${metric} — crossing ${t}% for the first time.`,
            type: "app", app,
          });
        }
      }

      // App all-time peak (top-10, 3+ months of data, once per app)
      const prevPeakVol = appPeakVol.get(app) ?? 0;
      const prevPeakVal = appPeakVal.get(app) ?? 0;
      const isNewPeak = metric === "volume" ? row.cit_volume_mn > prevPeakVol : row.cit_value_cr > prevPeakVal;
      if (row.cit_volume_mn > prevPeakVol) appPeakVol.set(app, row.cit_volume_mn);
      if (row.cit_value_cr > prevPeakVal) appPeakVal.set(app, row.cit_value_cr);
      if (isNewPeak && curRank <= 10 && seenMonths > 3 && !appPeakEmittedSet.has(app)) {
        appPeakEmittedSet.add(app);
        milestones.push({
          year: d.year, month: d.month, month_num: d.month_num,
          label: `${app} hit an all-time ${metric} peak`,
          description: `${app} set a new personal record for ${metric} in ${d.month} ${d.year}.`,
          type: "app", app,
        });
      }

      // Per-app MoM
      const prevV = prevMetricByApp.get(app);
      const appMom = prevV !== undefined && prevV > 0 ? ((v - prevV) / prevV) * 100 : null;

      // Rank boundary crossings (requires prior month)
      if (prevRankMap.size > 0) {
        if (!enteredTop5Set.has(app) && prevRank > 5 && curRank <= 5) {
          enteredTop5Set.add(app);
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} entered the top 5`,
            description: `${app} moved from #${prevRank} to #${curRank}, breaking into the top 5.`,
            type: "app", app,
          });
        }
        if (!exitedTop5Set.has(app) && prevRank <= 5 && curRank > 5 && (top5MonthsCount.get(app) ?? 0) >= 2) {
          exitedTop5Set.add(app);
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} dropped out of the top 5`,
            description: `${app} fell from #${prevRank} to #${curRank} after ${top5MonthsCount.get(app)} months in the top 5.`,
            type: "app", app,
          });
        }
        if (!enteredTop10Set.has(app) && prevRank > 10 && curRank <= 10) {
          enteredTop10Set.add(app);
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} entered the top 10`,
            description: `${app} moved from #${prevRank} to #${curRank}, breaking into the top 10.`,
            type: "app", app,
          });
        }
        if (!exitedTop10Set.has(app) && prevRank <= 10 && curRank > 10 && (top10MonthsCount.get(app) ?? 0) >= 3) {
          exitedTop10Set.add(app);
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} dropped out of the top 10`,
            description: `${app} fell from #${prevRank} to #${curRank} after ${top10MonthsCount.get(app)} months in the top 10.`,
            type: "app", app,
          });
        }
      }

      // Update top-5/10 counts after boundary checks
      if (curRank <= 5) top5MonthsCount.set(app, (top5MonthsCount.get(app) ?? 0) + 1);
      if (curRank <= 10) top10MonthsCount.set(app, (top10MonthsCount.get(app) ?? 0) + 1);

      if (appMom !== null) {
        // Personal growth record (rank ≤ 20, MoM ≥ 50%, new all-time best)
        const prevBest = appBestMoM.get(app) ?? -Infinity;
        if (curRank <= 20 && appMom >= 50 && appMom > prevBest) {
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} grew +${appMom.toFixed(0)}% MoM — fastest on record`,
            description: `${app} posted ${appMom.toFixed(1)}% month-over-month growth — its highest single-month growth rate on record.`,
            type: "app", app,
          });
        }
        if (appMom > prevBest) appBestMoM.set(app, appMom);

        // Personal decline record (prev rank ≤ 10, MoM ≤ -30%, new all-time worst)
        const prevWorst = appWorstMoM.get(app) ?? Infinity;
        if (prevRank <= 10 && appMom <= -30 && appMom < prevWorst) {
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} fell ${appMom.toFixed(0)}% MoM — steepest drop on record`,
            description: `${app} posted ${appMom.toFixed(1)}% month-over-month decline — its steepest single-month drop on record.`,
            type: "app", app,
          });
        }
        if (appMom < prevWorst) appWorstMoM.set(app, appMom);

        // Consecutive growth streak (top-20 apps, emit at 4 and 8)
        if (curRank <= 20) {
          const prevStreak = appGrowthStreak.get(app) ?? 0;
          const newStreak = appMom > 0 ? prevStreak + 1 : 0;
          appGrowthStreak.set(app, newStreak);
          if (newStreak === 4 || newStreak === 8) {
            if (!streakMilestonesEmitted.has(app)) streakMilestonesEmitted.set(app, new Set());
            const emitted = streakMilestonesEmitted.get(app)!;
            if (!emitted.has(newStreak)) {
              emitted.add(newStreak);
              milestones.push({
                year: d.year, month: d.month, month_num: d.month_num,
                label: `${app} on a ${newStreak}-month growth streak`,
                description: `${app} has posted positive month-over-month growth for ${newStreak} consecutive months.`,
                type: "app", app,
              });
            }
          }
        } else {
          appGrowthStreak.set(app, 0);
        }

        // Comeback (≥ 3 consecutive decline months, then MoM ≥ +25%, app in top 20)
        const prevDeclines = consecutiveDeclineCount.get(app) ?? 0;
        if (appMom > 25 && prevDeclines >= 3 && curRank <= 20 && !comebackEmitted.has(app)) {
          comebackEmitted.add(app);
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} posted its first positive month after ${prevDeclines}-month decline`,
            description: `After ${prevDeclines} consecutive months of decline, ${app} returned to positive growth at +${appMom.toFixed(1)}% MoM.`,
            type: "app", app,
          });
        }
        if (appMom > 0) {
          consecutiveDeclineCount.set(app, 0);
        } else {
          const newCount = prevDeclines + 1;
          consecutiveDeclineCount.set(app, newCount);
          if (newCount >= 3) comebackEmitted.delete(app);
        }
      }
    }

    // #1 rank changes
    const rankOne = rankedRows[0];
    if (rankOne) rankOneHistory.push(rankOne.app_name);

    // Rank change milestones
    if (prevRankMap.size) {
      for (const [app, prevRank] of prevRankMap) {
        const curRank = curRankMap.get(app);
        if (curRank === undefined) continue;
        if (prevRank <= 2 && curRank > 3) {
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} dropped out of top 3`,
            description: `${app} fell from #${prevRank} to #${curRank} in a single month.`,
            type: "app", app,
          });
        }
        if (curRank === 1 && prevRank > 1) {
          milestones.push({
            year: d.year, month: d.month, month_num: d.month_num,
            label: `${app} reached #1`,
            description: `${app} became the #1 UPI app by ${metric} for the first time (or returned to the top).`,
            type: "app", app,
          });
        }
      }
    }
    prevRankMap.clear();
    curRankMap.forEach((v, k) => prevRankMap.set(k, v));

    // Store this month's values for next iteration's MoM computation
    for (const row of d.rows) {
      prevMetricByApp.set(row.app_name, metric === "volume" ? row.cit_volume_mn : row.cit_value_cr);
    }
  }

  // Ecosystem all-time high (last data point)
  const last = sorted[sorted.length - 1];
  if (ecosystemPeakVol.year === last.year && ecosystemPeakVol.month === last.month) {
    milestones.push({
      year: last.year, month: last.month, month_num: last.month_num,
      label: "Ecosystem all-time high volume",
      description: `${last.month} ${last.year} is the highest volume month on record.`,
      type: "ecosystem",
    });
  }

  milestones.sort((a, b) => a.year * 100 + a.month_num - (b.year * 100 + b.month_num));
  return milestones;
}

/** Compact one-line story for a given month (used by Year-in-Review calendar) */
export function generateMonthStory(
  month: string,
  year: number,
  current: AppMonthData[],
  previous: AppMonthData[],
  metric: Metric,
): string {
  if (!current.length) return "";

  const sortedCur = ranked(current, metric);
  const total = totalFor(current, metric);
  const prevTotal = totalFor(previous, metric);
  const mom = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
  const curRanks = rankMap(current, metric);
  const prevRanks = rankMap(previous, metric);
  const prevByApp = new Map(previous.map((r) => [r.app_name, r]));
  const prevNames = new Set(previous.map((r) => r.app_name));

  // P1: New entrant in top 20
  if (previous.length > 0) {
    const newEntrants = sortedCur.slice(0, 20).filter((r) => !prevNames.has(r.app_name));
    if (newEntrants.length > 0) {
      const rank = curRanks.get(newEntrants[0].app_name) ?? 0;
      return `New: ${newEntrants[0].app_name} debuted at #${rank}`;
    }
  }

  // P2: Ecosystem volume milestone crossing
  if (previous.length > 0) {
    const curVol = current.reduce((a, r) => a + r.cit_volume_mn, 0);
    const prevVol = previous.reduce((a, r) => a + r.cit_volume_mn, 0);
    for (const t of [5000, 10000, 15000, 20000]) {
      if (prevVol < t && curVol >= t) {
        return `Milestone: UPI crossed ${(t / 1000).toFixed(0)}B transactions`;
      }
    }
  }

  // P3 & P4: Biggest rank movement in top 15 (≥ 4 spots)
  if (previous.length > 0) {
    const changes: { app: string; curRank: number; delta: number }[] = [];
    curRanks.forEach((cr, app) => {
      if (cr > 15) return;
      const pr = prevRanks.get(app);
      if (pr !== undefined) changes.push({ app, curRank: cr, delta: pr - cr });
    });
    const climbers = changes.filter((c) => c.delta >= 4).sort((a, b) => b.delta - a.delta);
    if (climbers.length > 0) return `${climbers[0].app} climbed ${climbers[0].delta} spots to #${climbers[0].curRank}`;
    const fallers = changes.filter((c) => c.delta <= -4).sort((a, b) => a.delta - b.delta);
    if (fallers.length > 0) return `${fallers[0].app} fell ${Math.abs(fallers[0].delta)} spots to #${fallers[0].curRank}`;
  }

  // P5: Fastest growing challenger (rank > 3, MoM ≥ 40%, was in top 20 previous month)
  if (previous.length > 0) {
    let best: { app: string; mom: number } | null = null;
    for (const row of sortedCur) {
      const rank = curRanks.get(row.app_name) ?? 0;
      if (rank <= 3 || rank > 20) continue;
      const prevRank = prevRanks.get(row.app_name) ?? 999;
      if (prevRank > 20) continue;
      const prev = prevByApp.get(row.app_name);
      if (!prev) continue;
      const p = pickMetric(prev, metric);
      if (p <= 0) continue;
      const appMom = ((pickMetric(row, metric) - p) / p) * 100;
      if (appMom >= 40 && (!best || appMom > best.mom)) best = { app: row.app_name, mom: appMom };
    }
    if (best) return `${best.app} surged +${best.mom.toFixed(0)}% MoM`;
  }

  // P6: Top-5 reshuffle — any of #2–#5 changed
  if (previous.length > 0) {
    for (let rank = 2; rank <= 5; rank++) {
      const curApp = sortedCur[rank - 1]?.app_name;
      let prevApp: string | undefined;
      prevRanks.forEach((pr, app) => { if (pr === rank) prevApp = app; });
      if (curApp && prevApp && curApp !== prevApp) {
        return `${curApp} moved to #${rank}, displacing ${prevApp}`;
      }
    }
  }

  // P7: Biggest top-10 app decline (MoM ≤ -5%)
  if (previous.length > 0) {
    let worst: { app: string; mom: number } | null = null;
    for (const row of sortedCur) {
      const rank = curRanks.get(row.app_name) ?? 0;
      if (rank > 10) continue;
      const prev = prevByApp.get(row.app_name);
      if (!prev) continue;
      const p = pickMetric(prev, metric);
      if (p <= 0) continue;
      const appMom = ((pickMetric(row, metric) - p) / p) * 100;
      if (appMom <= -5 && (!worst || appMom < worst.mom)) worst = { app: row.app_name, mom: appMom };
    }
    if (worst) return `${worst.app} dropped ${worst.mom.toFixed(0)}% MoM`;
  }

  // P8: Ecosystem surge (MoM > 5%)
  if (mom > 5) return `Ecosystem grew +${mom.toFixed(1)}% MoM`;

  // P9: Ecosystem contraction (MoM < -8%)
  if (mom < -8) return `Ecosystem contracted ${mom.toFixed(1)}% MoM`;

  // P10: Tight race — #2 and #3 within 1% share
  if (sortedCur.length >= 3) {
    const s2 = total > 0 ? (pickMetric(sortedCur[1], metric) / total) * 100 : 0;
    const s3 = total > 0 ? (pickMetric(sortedCur[2], metric) / total) * 100 : 0;
    if (Math.abs(s2 - s3) <= 1) {
      return `${sortedCur[1].app_name} (${s2.toFixed(1)}%) vs ${sortedCur[2].app_name} (${s3.toFixed(1)}%) — tight race`;
    }
  }

  // P11: Duopoly peak — top-2 combined > 83%
  if (sortedCur.length >= 2) {
    const s1 = total > 0 ? (pickMetric(sortedCur[0], metric) / total) * 100 : 0;
    const s2 = total > 0 ? (pickMetric(sortedCur[1], metric) / total) * 100 : 0;
    if (s1 + s2 > 83) {
      return `${sortedCur[0].app_name}+${sortedCur[1].app_name} command ${(s1 + s2).toFixed(0)}% — duopoly peak`;
    }
  }

  // P12: Default
  const leader = sortedCur[0];
  const leaderShare = leader && total ? (pickMetric(leader, metric) / total) * 100 : 0;
  return `${leader?.app_name ?? "—"} leads with ${leaderShare.toFixed(0)}% share`;
}

export function generateNarrative(
  month: string,
  year: number,
  current: AppMonthData[],
  previous: AppMonthData[],
  metric: Metric,
  topStates?: { displayName: string; share: number }[],
): string {
  if (!current.length) return "";
  const sorted = ranked(current, metric);
  const total = totalFor(current, metric);
  const prevTotal = totalFor(previous, metric);
  const ecosystemMoM = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : 0;

  const totalVolume = current.reduce((a, b) => a + b.cit_volume_mn, 0);
  const totalValue = current.reduce((a, b) => a + b.cit_value_cr, 0);
  const volumeDisplay = `${(totalVolume / 1000).toFixed(2)}B transactions`;
  const valueDisplay = `₹${(totalValue / 100000).toFixed(2)} lakh crore`;

  const leader = sorted[0];
  const runnerUp = sorted[1];
  const leaderShare = leader && total ? (pickMetric(leader, metric) / total) * 100 : 0;
  const runnerShare = runnerUp && total ? (pickMetric(runnerUp, metric) / total) * 100 : 0;
  const top2Pct = leaderShare + runnerShare;

  const prevMap = new Map(previous.map((r) => [r.app_name, r]));
  const movers = sorted
    .map((r) => {
      const p = prevMap.get(r.app_name);
      if (!p) return null;
      const c = pickMetric(r, metric);
      const pv = pickMetric(p, metric);
      if (pv <= 0) return null;
      return { app: r.app_name, pct: ((c - pv) / pv) * 100 };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const challengers = movers.filter(
    (m) => !sorted.slice(0, 3).find((s) => s.app_name === m.app),
  );
  const fastest = [...challengers].sort((a, b) => b.pct - a.pct)[0];

  const prevNames = new Set(previous.map((r) => r.app_name));
  const newApps = previous.length
    ? current.filter((r) => !prevNames.has(r.app_name)).map((r) => r.app_name)
    : [];

  const parts: string[] = [];
  parts.push(
    `In ${month} ${year}, India's UPI ecosystem processed ${volumeDisplay} worth ${valueDisplay} — ${
      ecosystemMoM >= 0 ? "up" : "down"
    } ${Math.abs(ecosystemMoM).toFixed(1)}% from last month.`,
  );
  if (leader && runnerUp) {
    parts.push(
      `${leader.app_name} leads with ${leaderShare.toFixed(1)}% share, followed by ${runnerUp.app_name} at ${runnerShare.toFixed(1)}% — together commanding ${top2Pct.toFixed(1)}% of ${
        metric === "volume" ? "volume" : "value"
      }.`,
    );
  }
  if (fastest) {
    parts.push(
      `${fastest.app} was the fastest-growing challenger at ${fastest.pct >= 0 ? "+" : ""}${fastest.pct.toFixed(1)}% MoM.`,
    );
  }
  if (newApps.length) {
    const list = newApps.slice(0, 3).join(", ");
    parts.push(
      `${newApps.length === 1 ? "A new entrant" : "New entrants"} this month: ${list}${newApps.length > 3 ? ` and ${newApps.length - 3} more` : ""}.`,
    );
  }
  if (topStates && topStates.length >= 2) {
    const metricWord = metric === "volume" ? "transactions" : "value";
    parts.push(
      `Geographically, ${topStates[0].displayName} leads with ${topStates[0].share.toFixed(1)}% of ${metricWord}, followed by ${topStates[1].displayName} at ${topStates[1].share.toFixed(1)}%.`,
    );
  }
  return parts.join(" ");
}
