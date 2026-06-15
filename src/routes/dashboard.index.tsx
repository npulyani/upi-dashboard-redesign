import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useDashboard } from "@/components/upi/DashboardContext";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { Sparkline } from "@/components/upi/Sparkline";
import { AppLogo } from "@/components/upi/AppLogo";
import { RankMovers } from "@/components/upi/RankMovers";
import { PerCapitaInsights } from "@/components/upi/PerCapitaInsights";
import {
  AVAILABLE_MONTHS,
  getPreviousMonth,
  formatNumber,
  formatIndianNumber,
} from "@/lib/upi/queries";
import {
  useAllMonths,
  useMccData,
  useMonthData,
  usePopulations,
  useSeasonalityMatrix,
  useStatewise,
} from "@/lib/upi/hooks";
import { calcPerCapita, calcSpendsPerCapita } from "@/lib/upi/population";
import { generateNarrative } from "@/lib/upi/insights";
import { latestMccMonth, mccForMonth, pickMccMetric } from "@/lib/upi/mcc";
import { SeasonalityHeatmap } from "@/components/upi/SeasonalityHeatmap";
import { MapMetric } from "@/lib/upi/types";

export const Route = createFileRoute("/dashboard/")({
  component: OverviewPage,
});

const MAP_METRICS: MapMetric[] = ["volume", "value", "txnsPerCapita", "spendsPerCapita"];
const MAP_METRIC_LABELS: Record<MapMetric, string> = {
  volume: "Volume",
  value: "Value",
  txnsPerCapita: "Txns per Capita",
  spendsPerCapita: "Spends per Capita",
};

const EMPTY_POPULATIONS = new Map<string, number>();

function OverviewPage() {
  const { year, month, metric } = useDashboard();
  const [mapMetric, setMapMetric] = useState<MapMetric>("volume");

  const { rows: current, isPending: loading } = useMonthData(year, month);
  const prevM = getPreviousMonth(year, month);
  const { rows: previous } = useMonthData(prevM?.year ?? null, prevM?.month ?? null);
  const stateData = useStatewise(year, month);
  const populations = usePopulations() ?? EMPTY_POPULATIONS;
  const { allMonths } = useAllMonths();
  const seasonalityMatrix = useSeasonalityMatrix(metric);

  // Last-12-months ecosystem total, derived from the shared history
  const ecosystemTrend = useMemo(() => {
    if (!allMonths.length) return [];
    const endIdx = AVAILABLE_MONTHS.findIndex((m) => m.year === year && m.month === month);
    if (endIdx < 0) return [];
    const startIdx = Math.max(0, endIdx - 11);
    const buckets = new Map(allMonths.map((b) => [`${b.year}-${b.month_num}`, b.rows]));
    return AVAILABLE_MONTHS.slice(startIdx, endIdx + 1).map((m) =>
      (buckets.get(`${m.year}-${m.month_num}`) ?? []).reduce(
        (sum, r) => sum + (metric === "volume" ? r.cit_volume_mn : r.cit_value_cr),
        0,
      ),
    );
  }, [allMonths, year, month, metric]);

  const sorted = useMemo(
    () =>
      [...current].sort((a, b) =>
        metric === "volume" ? b.cit_volume_mn - a.cit_volume_mn : b.cit_value_cr - a.cit_value_cr,
      ),
    [current, metric],
  );

  const total = useMemo(
    () =>
      sorted.reduce(
        (acc, r) => acc + (metric === "volume" ? r.cit_volume_mn : r.cit_value_cr),
        0,
      ),
    [sorted, metric],
  );
  const prevTotal = useMemo(
    () =>
      previous.reduce(
        (acc, r) => acc + (metric === "volume" ? r.cit_volume_mn : r.cit_value_cr),
        0,
      ),
    [previous, metric],
  );
  const mom = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : 0;

  const top4 = sorted.slice(0, 4);
  const top10 = sorted.slice(0, 10);

  // State leaderboard — driven by mapMetric so it always matches the map view
  const stateLeaderboard = useMemo(() => {
    if (!stateData.length) return [];
    const isGeo = (s: string) =>
      s.trim() !== "" &&
      !s.toLowerCase().includes("unclassified") &&
      !s.toLowerCase().includes("total");
    const statewiseRows = stateData.filter((r) => r.district === "" && isGeo(r.state_union_territory));
    const totalRows = stateData.filter(
      (r) =>
        r.district === "" &&
        r.state_union_territory.toLowerCase().endsWith(" total") &&
        !r.state_union_territory.toLowerCase().includes("unclassified"),
    );
    const source = statewiseRows.length > 0 ? statewiseRows : totalRows;

    const rows = source.map((r) => {
      const name = r.state_union_territory.replace(/ total$/i, "").trim();
      const tpc = calcPerCapita(r.volume_in_mn, name, populations);
      const spc = calcSpendsPerCapita(r.value_in_cr, name, populations);
      return { name, volume: r.volume_in_mn, value: r.value_in_cr, tpc, spc };
    });

    const getVal = (r: typeof rows[0]) => {
      if (mapMetric === "txnsPerCapita") return r.tpc ?? 0;
      if (mapMetric === "spendsPerCapita") return r.spc ?? 0;
      if (mapMetric === "value") return r.value;
      return r.volume;
    };

    const isPerCapitaMode = mapMetric === "txnsPerCapita" || mapMetric === "spendsPerCapita";
    const sum = rows.reduce((a, r) => a + getVal(r), 0);

    const validCount = rows.filter((r) => getVal(r) > 0).length;
    const avg = validCount > 0 ? sum / validCount : 0;

    return rows
      .map((r) => {
        const metricValue = getVal(r);
        const pctShare = sum > 0 ? (metricValue / sum) * 100 : 0;
        const pctVsAvg = avg > 0 ? ((metricValue - avg) / avg) * 100 : 0;
        return {
          ...r,
          displayName: r.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
          metricValue,
          share: pctShare, // kept for generateNarrative compatibility
          shareLabel: isPerCapitaMode
            ? `${pctVsAvg >= 0 ? "+" : ""}${pctVsAvg.toFixed(1)}% avg`
            : `${pctShare.toFixed(1)}%`,
        };
      })
      .filter((r) => r.metricValue > 0)
      .sort((a, b) => b.metricValue - a.metricValue);
  }, [stateData, metric, mapMetric, populations]);

  const narrative = useMemo(
    () => generateNarrative(month, year, current, previous, metric, stateLeaderboard.slice(0, 2)),
    [month, year, current, previous, metric, stateLeaderboard],
  );

  // Largest merchant category for the selected month (falls back to latest MCC month).
  const { mccRows } = useMccData();
  const topCategory = useMemo(() => {
    if (!mccRows.length) return null;
    const hasSelected = mccRows.some((r) => r.year === year && r.month === month);
    const eff = hasSelected ? { year, month } : latestMccMonth(mccRows);
    if (!eff) return null;
    const rows = mccForMonth(mccRows, eff.year, eff.month, false);
    if (!rows.length) return null;
    const top = [...rows].sort((a, b) => pickMccMetric(b, metric) - pickMccMetric(a, metric))[0];
    return { top, isLatest: eff.year === year && eff.month === month };
  }, [mccRows, year, month, metric]);

  if (loading && current.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground font-mono text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  const metricLabel = metric === "volume" ? "Volume (Mn txns)" : "Value (₹ Cr)";
  const totalDisplay =
    metric === "volume"
      ? `${(total / 1000).toFixed(2)}B`
      : `₹${(total / 100000).toFixed(2)}L Cr`;

  const top2Share =
    (((sorted[0]?.cit_volume_mn ?? 0) + (sorted[1]?.cit_volume_mn ?? 0)) /
      (current.reduce((a, b) => a + b.cit_volume_mn, 0) || 1)) *
    100;

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Narrative + key stats */}
      {narrative && (
        <BentoCard className="col-span-12" tone="dark">
          <CardLabel className="text-background/60">This month in UPI</CardLabel>
          <p className="font-serif text-xl lg:text-2xl mt-2 leading-snug text-background">
            {narrative}
            {topCategory && (
              <> The biggest merchant category is {topCategory.top.description}.</>
            )}
          </p>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Apps" value={String(current.length)} />
            <Stat label="Top 2 share" value={`${top2Share.toFixed(0)}%`} />
            <Stat label="MoM" value={`${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%`} />
            {topCategory && (
              <Link to="/dashboard/spending" className="block hover:opacity-80 transition-opacity">
                <Stat label="Top category" value={topCategory.top.description} />
              </Link>
            )}
          </div>
        </BentoCard>
      )}

      {/* Hero */}
      <BentoCard className="col-span-12 min-h-[280px] flex flex-col justify-between">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <CardLabel>Total {metricLabel} — {month} {year}</CardLabel>
            <h2 className="font-serif text-6xl lg:text-8xl mt-3 leading-[0.9] animate-number">
              {totalDisplay}
            </h2>
            <div className="mt-4 flex items-baseline gap-3">
              <span
                className={`font-mono text-sm font-medium ${mom >= 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {mom >= 0 ? "▲" : "▼"} {Math.abs(mom).toFixed(2)}%
              </span>
              <span className="text-xs text-muted-foreground">vs previous month</span>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <CardLabel>UPI trajectory · last 12 months</CardLabel>
          <div className="mt-2 text-primary">
            <Sparkline values={ecosystemTrend} height={72} />
          </div>
        </div>
      </BentoCard>

      {/* Top 4 cards */}
      {top4.map((row, i) => {
        const value = metric === "volume" ? row.cit_volume_mn : row.cit_value_cr;
        const share = total ? (value / total) * 100 : 0;
        return (
          <Link
            key={row.app_name}
            to="/dashboard/app/$appName"
            params={{ appName: encodeURIComponent(row.app_name) }}
            className="col-span-12 md:col-span-6 lg:col-span-3"
          >
            <BentoCard
              delay={160 + i * 60}
              className="min-h-[180px] h-full flex flex-col justify-between hover:ring-primary/40 hover:shadow-md cursor-pointer transition-all group"
            >
              <div className="flex justify-between items-start">
                <AppLogo app={row.app_name} domain={row.logo_domain} size={40} rounded="lg" />
                <span className="font-mono text-xs text-muted-foreground">#0{i + 1}</span>
              </div>
              <div className="mt-6">
                <h4 className="font-serif text-2xl group-hover:text-primary transition-colors">{row.app_name}</h4>
                <p className="mt-1 font-mono text-2xl font-medium text-primary tabular-nums">
                  {metric === "volume"
                    ? `${formatNumber(row.cit_volume_mn * 1e6, 1)}`
                    : `₹${formatIndianNumber(row.cit_value_cr)} Cr`}
                </p>
                <div className="mt-3 h-1 w-full bg-foreground/5 rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {share.toFixed(2)}% share
                  </p>
                  <span className="font-mono text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    View stats ↗
                  </span>
                </div>
              </div>
            </BentoCard>
          </Link>
        );
      })}

      {/* Rank movers */}
      <RankMovers current={current} previous={previous} metric={metric} delays={[300, 340]} />

      {/* India state map + leaderboard */}
      <BentoCard className="col-span-12 xl:col-span-6 h-full flex flex-col" delay={380}>
        <div className="flex flex-col 2xl:flex-row 2xl:items-start justify-between gap-4">
          <div>
            <CardLabel>UPI by State · {month} {year}</CardLabel>
            <h3 className="font-serif text-2xl mt-1">Geographic distribution</h3>
          </div>
          {/* Map metric toggle */}
          <div className="flex flex-wrap items-center rounded-lg border border-foreground/10 overflow-hidden text-[10px] font-mono uppercase tracking-wider shrink-0">
            {MAP_METRICS.map((m) => (
              <button
                key={m}
                onClick={() => setMapMetric(m)}
                className={`px-3 py-1.5 transition-colors ${
                  mapMetric === m
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-foreground/5"
                }`}
              >
                {MAP_METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {stateLeaderboard.length > 0 ? (
          <>
            <div className="mt-4 flex-1">
              {/* State leaderboard */}
              <ol className="overflow-y-auto h-[560px] space-y-0.5 pr-1">
                {stateLeaderboard.map((row, i) => {
                  const w = (row.metricValue / stateLeaderboard[0].metricValue) * 100;
                  return (
                    <li
                      key={row.name}
                      className="grid grid-cols-[28px_minmax(110px,180px)_1fr_82px] items-center gap-3 py-2 border-b border-foreground/[0.04] last:border-0"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground leading-none">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-medium text-xs truncate leading-none">
                        {row.displayName}
                      </span>
                      <div className="h-1.5 w-full bg-foreground/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/75"
                          style={{
                            width: `${w}%`,
                            transition: "width .5s cubic-bezier(.16,1,.3,1)",
                          }}
                        />
                      </div>
                      <div className="text-right leading-none">
                        <span className="font-mono text-[10px] text-primary tabular-nums block">
                          {mapMetric === "txnsPerCapita"
                            ? `${(row.tpc ?? 0).toFixed(2)}`
                            : mapMetric === "spendsPerCapita"
                              ? `₹${(row.spc ?? 0).toFixed(0)}`
                              : mapMetric === "value"
                                ? `₹${formatIndianNumber(row.value)}`
                                : `${row.volume.toFixed(1)}M`}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground block mt-0.5">
                          {row.shareLabel}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {/* StateMap (src/components/upi/StateMap.tsx) intentionally not rendered:
                  even hidden it fetched the 756KB /india-states.json topojson.
                  Re-import and render it here when the map view returns. */}
            </div>

            {/* Per-capita insights — shown only when per-capita mode is active */}
            {(mapMetric === "txnsPerCapita" || mapMetric === "spendsPerCapita") && (
              <PerCapitaInsights
                stateData={stateData}
                populations={populations}
                mapMetric={mapMetric}
              />
            )}
          </>
        ) : (
          <p className="mt-6 font-mono text-xs text-muted-foreground uppercase tracking-widest">
            No statewise data available for this period
          </p>
        )}
      </BentoCard>

      {/* Top 10 ranked list */}
      <BentoCard className="col-span-12 xl:col-span-6 h-full flex flex-col" delay={420}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <CardLabel>Top 10 · {metric === "volume" ? "by volume" : "by value"}</CardLabel>
            <h3 className="font-serif text-2xl mt-1">Leaderboard</h3>
          </div>
        </div>
        <ol className="space-y-1 h-[560px] overflow-y-auto pr-1">
          {top10.map((row, i) => {
            const value = metric === "volume" ? row.cit_volume_mn : row.cit_value_cr;
            const max = metric === "volume" ? top10[0].cit_volume_mn : top10[0].cit_value_cr;
            const w = (value / max) * 100;
            return (
              <Link
                key={row.app_name}
                to="/dashboard/app/$appName"
                params={{ appName: encodeURIComponent(row.app_name) }}
                className="grid grid-cols-[28px_minmax(120px,160px)_1fr_92px] items-center gap-3 py-2 border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.03] rounded-lg px-2 -mx-2 transition-colors cursor-pointer group"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-medium text-sm truncate inline-flex items-center gap-2.5 group-hover:text-primary transition-colors">
                  <AppLogo app={row.app_name} domain={row.logo_domain} size={22} />
                  {row.app_name}
                </span>
                <div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: `${w}%`, transition: "width .6s cubic-bezier(.16,1,.3,1)" }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums text-right">
                  {metric === "volume"
                    ? `${row.cit_volume_mn.toFixed(1)}M`
                    : `₹${formatIndianNumber(row.cit_value_cr)}`}
                </span>
              </Link>
            );
          })}
        </ol>
      </BentoCard>

      {/* Festival effect / seasonality heatmap */}
      {seasonalityMatrix.length > 0 && (
        <BentoCard className="col-span-12" delay={460}>
          <CardLabel>Seasonality · MoM growth by month</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-6">The festival effect</h3>
          <SeasonalityHeatmap matrix={seasonalityMatrix} />
        </BentoCard>
      )}
    </div>
  );
}


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">{label}</p>
      <p className="font-serif text-2xl mt-1 text-background">{value}</p>
    </div>
  );
}
