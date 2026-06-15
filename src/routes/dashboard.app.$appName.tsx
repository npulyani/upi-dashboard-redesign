import { useEffect, useMemo, useState } from "react";
import { analytics } from "@/lib/analytics";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Star } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { SeasonalityHeatmap } from "@/components/upi/SeasonalityHeatmap";
import { useDashboard } from "@/components/upi/DashboardContext";
import { MetricToggle } from "@/components/upi/Controls";
import { AppLink } from "@/components/upi/AppLink";
import { AppLogo } from "@/components/upi/AppLogo";
import { RankBadge } from "@/components/upi/RankBadge";
import { formatIndianNumber, formatNumber } from "@/lib/upi/queries";
import { useAllMonths, useMonthData, useSeasonalityMatrix, useMarketEvents } from "@/lib/upi/hooks";
import {
  avgTicket,
  cagr,
  pickMetric,
  ranked,
  rankMap,
  totalFor,
} from "@/lib/upi/insights";
import { TrendPoint } from "@/lib/upi/types";
import {
  EVENT_CATEGORY_COLORS,
  eventDateDisplay,
  eventMonthLabel,
} from "@/lib/upi/events";
import { getAppProfile, FEATURE_LABELS, type AppFeatures } from "@/lib/upi/appProfiles";

export const Route = createFileRoute("/dashboard/app/$appName")({
  head: ({ params }) => ({
    meta: [
      { title: `${decodeURIComponent(params.appName)} — State of UPI` },
      {
        name: "description",
        content: `Full UPI transaction history for ${decodeURIComponent(params.appName)}: volume, value, rank, market share, and growth.`,
      },
    ],
  }),
  component: AppDeepDive,
});

type HistoryPoint = TrendPoint & {
  rank: number | null;
  share: number;
  ticket: number;
};

function AppDeepDive() {
  const { appName } = Route.useParams();
  const decoded = decodeURIComponent(appName);
  const { metric, setMetric, year, month } = useDashboard();

  useEffect(() => {
    analytics.appViewed(decoded);
  }, [decoded]);

  const { allMonths, isPending: loading } = useAllMonths();
  const seasonalityMatrix = useSeasonalityMatrix(metric, decoded);
  const allEvents = useMarketEvents();

  const [rivalApp, setRivalApp] = useState<string | null>(null);

  const history = useMemo<HistoryPoint[]>(() => {
    return allMonths.map((b) => {
      const r = b.rows.find((x) => x.app_name === decoded);
      const totV = totalFor(b.rows, "volume");
      const totVa = totalFor(b.rows, "value");
      const ranks = rankMap(b.rows, metric);
      const share = r
        ? metric === "volume"
          ? totV ? (r.cit_volume_mn / totV) * 100 : 0
          : totVa ? (r.cit_value_cr / totVa) * 100 : 0
        : 0;
      return {
        year: b.year,
        month: b.month,
        month_num: b.month_num,
        label: `${b.month} '${String(b.year).slice(2)}`,
        cit_volume_mn: r?.cit_volume_mn ?? 0,
        cit_value_cr: r?.cit_value_cr ?? 0,
        rank: r ? ranks.get(decoded) ?? null : null,
        share,
        ticket: r ? avgTicket(r) : 0,
      };
    });
  }, [allMonths, decoded, metric]);

  const appDomain = useMemo(
    () =>
      allMonths
        .flatMap((b) => b.rows)
        .find((x) => x.app_name === decoded)?.logo_domain ?? null,
    [allMonths, decoded],
  );

  const selectedPoint = useMemo(() => {
    return (
      history.find((h) => h.year === year && h.month === month) ??
      history[history.length - 1] ??
      null
    );
  }, [history, year, month]);

  const stats = useMemo(() => {
    if (!history.length || !selectedPoint) return null;
    const idx = history.indexOf(selectedPoint);
    const prev = history[idx - 1] ?? null;
    const yearAgo = history[idx - 12] ?? null;
    const threeYearAgo = history[idx - 36] ?? null;
    const curV = pickMetric(selectedPoint, metric);
    const prevV = prev ? pickMetric(prev, metric) : 0;
    const yaV = yearAgo ? pickMetric(yearAgo, metric) : 0;
    const tyaV = threeYearAgo ? pickMetric(threeYearAgo, metric) : 0;
    const mom = prevV ? ((curV - prevV) / prevV) * 100 : null;
    const yoy = yaV ? ((curV - yaV) / yaV) * 100 : null;
    const cagr3 = cagr(tyaV, curV, 3);
    return { latest: selectedPoint, mom, yoy, cagr3, curV };
  }, [history, metric, selectedPoint]);

  const { rows: monthRows } = useMonthData(year, month);

  const premium = useMemo(() => {
    const totVol = monthRows.reduce((a, b) => a + b.cit_volume_mn, 0);
    const totVal = monthRows.reduce((a, b) => a + b.cit_value_cr, 0);
    const me = monthRows.find((r) => r.app_name === decoded);
    return me && totVol && totVal && me.cit_volume_mn > 0
      ? (me.cit_value_cr / totVal) / (me.cit_volume_mn / totVol)
      : null;
  }, [monthRows, decoded]);

  const neighbors = useMemo(() => {
    const sortedRows = ranked(monthRows, metric);
    const idx = sortedRows.findIndex((r) => r.app_name === decoded);
    if (idx < 0) return [];
    const around: { app: string; rank: number; domain: string | null }[] = [];
    [-2, -1, 1, 2].forEach((off) => {
      const t = sortedRows[idx + off];
      if (t) around.push({ app: t.app_name, rank: idx + off + 1, domain: t.logo_domain ?? null });
    });
    return around;
  }, [monthRows, metric, decoded]);

  // Seed rival from neighbors when they load (only once)
  useEffect(() => {
    if (rivalApp === null && neighbors.length > 0) {
      setRivalApp(neighbors[0].app);
    }
  }, [neighbors, rivalApp]);

  // Rival history for head-to-head chart
  const rivalHistory = useMemo<HistoryPoint[]>(() => {
    if (!rivalApp) return [];
    return allMonths.map((b) => {
      const r = b.rows.find((x) => x.app_name === rivalApp);
      const totV = totalFor(b.rows, "volume");
      const totVa = totalFor(b.rows, "value");
      const ranks = rankMap(b.rows, metric);
      const share = r
        ? metric === "volume"
          ? totV ? (r.cit_volume_mn / totV) * 100 : 0
          : totVa ? (r.cit_value_cr / totVa) * 100 : 0
        : 0;
      return {
        year: b.year,
        month: b.month,
        month_num: b.month_num,
        label: `${b.month} '${String(b.year).slice(2)}`,
        cit_volume_mn: r?.cit_volume_mn ?? 0,
        cit_value_cr: r?.cit_value_cr ?? 0,
        rank: r ? ranks.get(rivalApp) ?? null : null,
        share,
        ticket: r ? avgTicket(r) : 0,
      };
    });
  }, [allMonths, rivalApp, metric]);

  // Merged dataset for head-to-head chart
  const h2hData = useMemo(() => {
    return history.map((h, i) => ({
      label: h.label,
      current: pickMetric(h, metric),
      rival: rivalHistory[i] ? pickMetric(rivalHistory[i], metric) : 0,
    }));
  }, [history, rivalHistory, metric]);

  // Events filtered to this app
  const appEvents = useMemo(
    () => allEvents.filter((e) => e.apps_affected.includes(decoded)),
    [allEvents, decoded],
  );

  const profile = useMemo(() => getAppProfile(decoded), [decoded]);

  function exportCsv() {
    const header = ["Year", "Month", "Volume (Mn)", "Value (Cr)", "Rank", "Share %", "Avg Ticket (₹)"];
    const lines = [header.join(",")];
    history.forEach((h) => {
      lines.push(
        [
          h.year,
          h.month,
          h.cit_volume_mn.toFixed(2),
          h.cit_value_cr.toFixed(2),
          h.rank ?? "",
          h.share.toFixed(3),
          h.ticket.toFixed(2),
        ].join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `upi-${decoded.replace(/\s+/g, "-")}-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !history.length) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground font-mono text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  const metricLabel = metric === "volume" ? "Volume" : "Value";
  const fmt = (v: number) =>
    metric === "volume" ? `${formatNumber(v * 1e6, 1)}` : `₹${formatIndianNumber(v)} Cr`;

  return (
    <div className="space-y-5">
      {/* Back nav + actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to dashboard
        </Link>
        <div className="flex items-center gap-2">
          <MetricToggle metric={metric} onChange={setMetric} />
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Hero */}
        <BentoCard className="col-span-12 lg:col-span-8 min-h-[300px] flex flex-col justify-between">
          <div>
            <CardLabel>Provider · {stats?.latest.label}</CardLabel>
            <div className="mt-3 flex items-center gap-5">
              <AppLogo app={decoded} domain={appDomain} size={72} rounded="lg" />
              <h1 className="font-serif text-5xl lg:text-7xl leading-[0.95]">
                <em className="italic">{decoded}</em>
              </h1>
            </div>
            <div className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Rank</p>
                <p className="font-serif text-3xl mt-1">#{stats?.latest.rank ?? "—"}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{metricLabel}</p>
                <p className="font-serif text-3xl mt-1">{stats ? fmt(stats.curV) : "—"}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Share</p>
                <p className="font-serif text-3xl mt-1">{stats?.latest.share.toFixed(2)}%</p>
              </div>
              <div title="Value share ÷ volume share — above 1× skews to high-ticket transactions">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Premium</p>
                <p className="font-serif text-3xl mt-1">{premium !== null ? `${premium.toFixed(2)}×` : "—"}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 pt-5 border-t border-foreground/5">
            <Delta label="MoM" value={stats?.mom ?? null} />
            <Delta label="YoY" value={stats?.yoy ?? null} />
            <Delta label="3yr CAGR" value={stats?.cagr3 ?? null} suffix=" /yr" />
          </div>
        </BentoCard>

        {/* Provider profile */}
        <BentoCard className="col-span-12 lg:col-span-4 min-h-[300px] flex flex-col gap-4" delay={80}>
          <div>
            <CardLabel>Provider profile</CardLabel>
            {profile ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{profile.blurb}</p>
                <dl className="mt-4 space-y-2">
                  <ProfileRow label="Parent" value={profile.parent} />
                  <ProfileRow label="Type" value={profile.type} />
                  <ProfileRow label="Launched" value={profile.launched} />
                  <ProfileRow label="HQ" value={profile.hq} />
                  {profile.psp_banks.length > 0 && (
                    <ProfileRow label="PSP banks" value={profile.psp_banks.join(", ")} />
                  )}
                </dl>
                {profile.play_store_rating > 0 && (
                  <div className="mt-4 flex items-center gap-1.5 text-sm">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-medium">{profile.play_store_rating}</span>
                    <span className="text-muted-foreground">· {profile.play_store_installs} installs</span>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No profile data available yet.</p>
            )}
          </div>
        </BentoCard>

        {/* Full history chart with event annotations */}
        <BentoCard className="col-span-12 min-h-[420px]" delay={140}>
          <CardLabel>Full history · since Jan 2021</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-4">
            {metric === "volume" ? "Transaction volume" : "Transaction value"} trajectory
          </h3>
          {appEvents.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-3">
              {Object.entries(EVENT_CATEGORY_COLORS).map(([cat, color]) => (
                <div key={cat} className="flex items-center gap-1.5">
                  <div className="w-0.5 h-3.5 rounded-full" style={{ background: color }} />
                  <span className="font-mono text-[10px] text-muted-foreground capitalize">{cat}</span>
                </div>
              ))}
            </div>
          )}
          <div className="h-[320px] w-full text-primary">
            <ResponsiveContainer>
              <AreaChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="appFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--color-muted-foreground)"
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(history.length / 10))}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatNumber(v as number)}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [
                    metric === "volume" ? `${(v as number).toFixed(1)}M` : `₹${formatIndianNumber(v as number)} Cr`,
                    metricLabel,
                  ]}
                />
                <ReferenceLine
                  x={selectedPoint?.label}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
                {appEvents.map((e) => (
                  <ReferenceLine
                    key={e.event_date}
                    x={eventMonthLabel(e)}
                    stroke={EVENT_CATEGORY_COLORS[e.category]}
                    strokeWidth={1.5}
                    strokeOpacity={0.8}
                    label={{
                      value: "●",
                      position: "top",
                      fill: EVENT_CATEGORY_COLORS[e.category],
                      fontSize: 8,
                    }}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey={metric === "volume" ? "cit_volume_mn" : "cit_value_cr"}
                  stroke="currentColor"
                  strokeWidth={2}
                  fill="url(#appFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Key moments — inline below chart, hidden when no events */}
          {appEvents.length > 0 && (
            <div className="mt-6 pt-5 border-t border-foreground/5">
              <CardLabel>Key moments</CardLabel>
              <ol className="mt-3 space-y-4">
                {appEvents.map((e) => (
                  <li key={e.event_date} className="flex gap-3">
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <div
                        className="size-2.5 rounded-full flex-shrink-0"
                        style={{ background: EVENT_CATEGORY_COLORS[e.category] }}
                      />
                      <div className="w-px flex-1 bg-foreground/[0.06]" />
                    </div>
                    <div className="pb-3 last:pb-0">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {eventDateDisplay(e)} · {e.category}
                      </p>
                      <p className="mt-0.5 text-sm font-medium leading-snug">{e.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{e.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </BentoCard>

        {/* Seasonality heatmap — full width */}
        <BentoCard className="col-span-12" delay={200}>
          <CardLabel>Seasonality · MoM growth by month</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-4">The festival effect</h3>
          <SeasonalityHeatmap matrix={seasonalityMatrix} />
        </BentoCard>

        {/* Feature support matrix */}
        {profile && (
          <BentoCard className="col-span-12" delay={240}>
            <CardLabel>Feature support</CardLabel>
            <div className="mt-3 flex flex-wrap gap-3">
              {(Object.keys(FEATURE_LABELS) as (keyof AppFeatures)[]).map((key) => {
                const supported = profile.features[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                      supported
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "border-foreground/10 bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`size-2 rounded-full flex-shrink-0 ${
                        supported ? "bg-emerald-500" : "bg-foreground/20"
                      }`}
                    />
                    {FEATURE_LABELS[key]}
                  </div>
                );
              })}
            </div>
          </BentoCard>
        )}

        {/* Neighbors */}
        <BentoCard className="col-span-12 lg:col-span-5 min-h-[300px]" delay={260}>
          <CardLabel>Movers around #{stats?.latest.rank ?? "—"} · {month} {year}</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-4">Direct neighbors</h3>
          <ul className="space-y-2">
            {neighbors.map((n) => (
              <li
                key={n.app}
                className="flex items-center justify-between gap-3 py-2 border-b border-foreground/[0.04] last:border-0"
              >
                <span className="font-mono text-xs text-muted-foreground w-8">
                  #{String(n.rank).padStart(2, "0")}
                </span>
                <span className="flex-1 font-medium text-sm inline-flex items-center gap-2.5">
                  <AppLogo app={n.app} domain={n.domain} size={22} />
                  <AppLink app={n.app} />
                </span>
                <RankBadge delta={n.rank < (stats?.latest.rank ?? 0) ? 1 : -1} />
              </li>
            ))}
            {neighbors.length === 0 && (
              <li className="text-sm text-muted-foreground">No direct neighbors found.</li>
            )}
          </ul>
        </BentoCard>

        {/* Share trajectory */}
        <BentoCard className="col-span-12 lg:col-span-7" delay={320}>
          <CardLabel>Market share trajectory</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-4">Slice of the ecosystem</h3>
          <div className="h-[160px] w-full text-primary">
            <ResponsiveContainer>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="shareFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--color-muted-foreground)"
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(history.length / 10))}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${(v as number).toFixed(2)}%`, "Share"]}
                />
                <Area type="monotone" dataKey="share" stroke="currentColor" strokeWidth={2} fill="url(#shareFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </BentoCard>

        {/* Head-to-head comparison */}
        {neighbors.length > 0 && (
          <BentoCard className="col-span-12" delay={380}>
            <CardLabel>Head-to-head</CardLabel>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <h3 className="font-serif text-2xl mt-1">
                {decoded} vs {rivalApp ?? "—"}
              </h3>
              {/* Rival logo chip picker */}
              <div className="flex gap-3 mt-1 flex-wrap">
                {neighbors.map((n) => (
                  <button
                    key={n.app}
                    onClick={() => setRivalApp(n.app)}
                    className={`flex flex-col items-center gap-1.5 transition-opacity ${
                      rivalApp === n.app ? "opacity-100" : "opacity-40 hover:opacity-70"
                    }`}
                  >
                    <div
                      className={`rounded-full p-0.5 transition-all ${
                        rivalApp === n.app
                          ? "ring-2 ring-offset-2 ring-foreground/30 ring-offset-background"
                          : ""
                      }`}
                    >
                      <AppLogo app={n.app} domain={n.domain} size={32} rounded="full" />
                    </div>
                    <span className="font-mono text-[9px] text-muted-foreground max-w-[52px] text-center leading-tight">
                      {n.app}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-0.5 rounded bg-foreground/70" />
                <span>{decoded}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-0.5 rounded" style={{ background: "var(--color-chart-2)" }} />
                <span>{rivalApp}</span>
              </div>
            </div>
            <div className="h-[220px] w-full mt-4">
              <ResponsiveContainer>
                <AreaChart data={h2hData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="h2hCurrentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="h2hRivalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--color-muted-foreground)"
                    tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(0, Math.floor(h2hData.length / 10))}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatNumber(v as number)}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-card)",
                      fontSize: 12,
                    }}
                    formatter={(v: number, name: string) => [
                      metric === "volume" ? `${(v as number).toFixed(1)}M` : `₹${formatIndianNumber(v as number)} Cr`,
                      name === "current" ? decoded : (rivalApp ?? "Rival"),
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="current"
                    stroke="var(--color-foreground)"
                    strokeWidth={2}
                    fill="url(#h2hCurrentFill)"
                    strokeOpacity={0.8}
                  />
                  <Area
                    type="monotone"
                    dataKey="rival"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    fill="url(#h2hRivalFill)"
                    strokeOpacity={0.8}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </BentoCard>
        )}
      </div>
    </div>
  );
}

function Delta({ label, value, suffix = "" }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={`font-mono text-base mt-1 font-medium ${
          value === null ? "text-muted-foreground" : value >= 0 ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%${suffix}`}
      </p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground w-20 flex-shrink-0 pt-0.5">
        {label}
      </dt>
      <dd className="text-foreground leading-snug">{value}</dd>
    </div>
  );
}
