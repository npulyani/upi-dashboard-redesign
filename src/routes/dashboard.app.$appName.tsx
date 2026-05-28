import { useEffect, useMemo, useState } from "react";
import { analytics } from "@/lib/analytics";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { useDashboard } from "@/components/upi/DashboardContext";
import { MetricToggle } from "@/components/upi/Controls";
import { AppLink } from "@/components/upi/AppLink";
import { AppLogo } from "@/components/upi/AppLogo";
import { RankBadge } from "@/components/upi/RankBadge";
import {
  AVAILABLE_MONTHS,
  LATEST_MONTH,
  formatIndianNumber,
  formatNumber,
  getMonthData,
} from "@/lib/upi/queries";
import {
  avgTicket,
  cagr,
  pickMetric,
  ranked,
  rankMap,
  totalFor,
} from "@/lib/upi/insights";
import { TrendPoint } from "@/lib/upi/types";

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

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [neighbors, setNeighbors] = useState<{ app: string; rank: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analytics.appViewed(decoded);
  }, [decoded]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Fetch every month (cached on repeat visits)
      const all = await Promise.all(
        AVAILABLE_MONTHS.map((m) => getMonthData(m.year, m.month)),
      );
      if (cancelled) return;
      const pts: HistoryPoint[] = AVAILABLE_MONTHS.map((m, i) => {
        const rows = all[i];
        const r = rows.find((x) => x.app_name === decoded);
        const totV = totalFor(rows, "volume");
        const totVa = totalFor(rows, "value");
        const ranks = rankMap(rows, metric);
        const share = r
          ? metric === "volume"
            ? totV ? (r.cit_volume_mn / totV) * 100 : 0
            : totVa ? (r.cit_value_cr / totVa) * 100 : 0
          : 0;
        return {
          year: m.year,
          month: m.month,
          month_num: m.month_num,
          label: `${m.month} '${String(m.year).slice(2)}`,
          cit_volume_mn: r?.cit_volume_mn ?? 0,
          cit_value_cr: r?.cit_value_cr ?? 0,
          rank: r ? ranks.get(decoded) ?? null : null,
          share,
          ticket: r ? avgTicket(r) : 0,
        };
      });
      setHistory(pts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [decoded, metric]);

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

    const active = history.filter((h) => pickMetric(h, metric) > 0);
    const peak = active.reduce(
      (p, c) => (pickMetric(c, metric) > pickMetric(p, metric) ? c : p),
      active[0] ?? selectedPoint,
    );
    const low = active.reduce(
      (p, c) => (pickMetric(c, metric) < pickMetric(p, metric) ? c : p),
      active[0] ?? selectedPoint,
    );
    let streak = 0;
    let best = 0;
    history.forEach((h) => {
      if (h.rank === 1) { streak += 1; best = Math.max(best, streak); } else streak = 0;
    });
    return { latest: selectedPoint, mom, yoy, cagr3, peak, low, bestStreak: best, curV };
  }, [history, metric, selectedPoint]);

  useEffect(() => {
    if (!history.length) return;
    getMonthData(year, month).then((rows) => {
      const sortedRows = ranked(rows, metric);
      const idx = sortedRows.findIndex((r) => r.app_name === decoded);
      if (idx < 0) { setNeighbors([]); return; }
      const around: { app: string; rank: number }[] = [];
      [-2, -1, 1, 2].forEach((off) => {
        const t = sortedRows[idx + off];
        if (t) around.push({ app: t.app_name, rank: idx + off + 1 });
      });
      setNeighbors(around);
    });
  }, [year, month, metric, decoded, history.length]);

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
              <AppLogo app={decoded} size={72} rounded="lg" />
              <h1 className="font-serif text-5xl lg:text-7xl leading-[0.95]">
                <em className="italic">{decoded}</em>
              </h1>
            </div>
            <div className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Rank
                </p>
                <p className="font-serif text-3xl mt-1">
                  #{stats?.latest.rank ?? "—"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {metricLabel}
                </p>
                <p className="font-serif text-3xl mt-1">{stats ? fmt(stats.curV) : "—"}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Share
                </p>
                <p className="font-serif text-3xl mt-1">
                  {stats?.latest.share.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 pt-5 border-t border-foreground/5">
            <Delta label="MoM" value={stats?.mom ?? null} />
            <Delta label="YoY" value={stats?.yoy ?? null} />
            <Delta label="3yr CAGR" value={stats?.cagr3 ?? null} suffix=" /yr" />
          </div>
        </BentoCard>

        {/* Peak / Low / Streak */}
        <BentoCard tone="primary" className="col-span-12 lg:col-span-4 min-h-[300px] flex flex-col justify-between" delay={80}>
          <div>
            <span className="inline-flex px-3 py-1 rounded-full bg-white/15 font-mono text-[10px] uppercase tracking-widest">
              Records
            </span>
            <div className="mt-5 space-y-4">
              <RecordRow
                label="All-time peak"
                value={stats?.peak ? fmt(pickMetric(stats.peak, metric)) : "—"}
                sub={stats?.peak?.label ?? ""}
              />
              <RecordRow
                label="All-time low"
                value={stats?.low ? fmt(pickMetric(stats.low, metric)) : "—"}
                sub={stats?.low?.label ?? ""}
              />
              <RecordRow
                label="Months at #1"
                value={String(stats?.bestStreak ?? 0)}
                sub={stats?.bestStreak ? "consecutive" : "never led"}
              />
            </div>
          </div>
        </BentoCard>

        {/* Full history chart */}
        <BentoCard className="col-span-12 min-h-[420px]" delay={140}>
          <CardLabel>Full history · since Jan 2021</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-4">
            {metric === "volume" ? "Transaction volume" : "Transaction value"} trajectory
          </h3>
          <div className="h-[340px] w-full text-primary">
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
        </BentoCard>

        {/* Rank timeline */}
        <BentoCard className="col-span-12 lg:col-span-7 min-h-[300px]" delay={200}>
          <CardLabel>Rank over time</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-4">Climbing the ladder</h3>
          <div className="h-[220px] w-full text-primary">
            <ResponsiveContainer>
              <LineChart data={history.filter((h) => h.rank !== null)}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--color-muted-foreground)"
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(history.length / 8))}
                />
                <YAxis
                  reversed
                  stroke="var(--color-muted-foreground)"
                  tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  domain={[1, "dataMax"]}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-card)",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`#${v}`, "Rank"]}
                />
                <ReferenceLine
                  x={selectedPoint?.label}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
                <Line type="stepAfter" dataKey="rank" stroke="currentColor" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </BentoCard>

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
                  <AppLogo app={n.app} size={22} />
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
        <BentoCard className="col-span-12 min-h-[280px]" delay={320}>
          <CardLabel>Market share trajectory</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-4">Slice of the ecosystem</h3>
          <div className="h-[200px] w-full text-primary">
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

function RecordRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-white/60">{label}</p>
      <p className="font-serif text-2xl mt-0.5">{value}</p>
      <p className="font-mono text-[10px] text-white/50 mt-0.5">{sub}</p>
    </div>
  );
}

// Avoid unused-import warnings
void LATEST_MONTH;
