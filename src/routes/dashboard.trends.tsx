import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useDashboard } from "@/components/upi/DashboardContext";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import {
  getMonthData,
  getPreviousMonth,
  getMultiAppTrend,
  getUniqueApps,
  getMonthOffset,
  formatNumber,
  formatIndianNumber,
} from "@/lib/upi/queries";
import { AppMonthData } from "@/lib/upi/types";

export const Route = createFileRoute("/dashboard/trends")({
  head: () => ({
    meta: [
      { title: "Trends — State of UPI" },
      { name: "description", content: "Multi-app trends and market share analysis for India's UPI ecosystem." },
    ],
  }),
  component: TrendsPage,
});

const SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function TrendsPage() {
  const { year, month, metric } = useDashboard();
  const [allApps, setAllApps] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [current, setCurrent] = useState<AppMonthData[]>([]);
  const [prev, setPrev] = useState<AppMonthData[]>([]);
  const [sixAgo, setSixAgo] = useState<AppMonthData[]>([]);
  const [twelveAgo, setTwelveAgo] = useState<AppMonthData[]>([]);
  const [trendRows, setTrendRows] = useState<Record<string, number | string>[]>([]);

  useEffect(() => {
    (async () => {
      const apps = await getUniqueApps();
      setAllApps(apps);
      if (selected.length === 0) {
        // sensible defaults from latest snapshot
        const latest = await getMonthData(year, month);
        const top3 = [...latest]
          .sort((a, b) => b.cit_volume_mn - a.cit_volume_mn)
          .slice(0, 3)
          .map((r) => r.app_name);
        setSelected(top3);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cur, six, twelve] = await Promise.all([
        getMonthData(year, month),
        (async () => {
          const o = getMonthOffset(year, month, 6);
          return o ? await getMonthData(o.year, o.month) : [];
        })(),
        (async () => {
          const o = getMonthOffset(year, month, 12);
          return o ? await getMonthData(o.year, o.month) : [];
        })(),
      ]);
      const p = getPreviousMonth(year, month);
      const prevData = p ? await getMonthData(p.year, p.month) : [];
      if (cancelled) return;
      setCurrent(cur);
      setPrev(prevData);
      setSixAgo(six);
      setTwelveAgo(twelve);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  useEffect(() => {
    if (selected.length === 0) {
      setTrendRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await getMultiAppTrend(selected, 24, year, month);
      if (!cancelled) setTrendRows(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, year, month]);

  // Insights
  const insights = useMemo(() => {
    if (!current.length || !prev.length) return null;
    const prevMap = new Map(prev.map((r) => [r.app_name, r]));
    const diffs = current
      .map((r) => {
        const p = prevMap.get(r.app_name);
        const cur = metric === "volume" ? r.cit_volume_mn : r.cit_value_cr;
        const past = p ? (metric === "volume" ? p.cit_volume_mn : p.cit_value_cr) : 0;
        const pct = past ? ((cur - past) / past) * 100 : 0;
        return { name: r.app_name, pct, cur, past };
      })
      .filter((d) => d.past > 0);

    const gainer = [...diffs].sort((a, b) => b.pct - a.pct)[0];
    const decliner = [...diffs].sort((a, b) => a.pct - b.pct)[0];
    const totalCur = current.reduce(
      (a, b) => a + (metric === "volume" ? b.cit_volume_mn : b.cit_value_cr),
      0,
    );
    const totalPrev = prev.reduce(
      (a, b) => a + (metric === "volume" ? b.cit_volume_mn : b.cit_value_cr),
      0,
    );
    const ecosystem = totalPrev ? ((totalCur - totalPrev) / totalPrev) * 100 : 0;
    return { gainer, decliner, ecosystem };
  }, [current, prev, metric]);

  const sharePeriods = useMemo(() => {
    const calc = (rows: AppMonthData[]) => {
      const total = rows.reduce(
        (a, b) => a + (metric === "volume" ? b.cit_volume_mn : b.cit_value_cr),
        0,
      );
      return rows.map((r) => {
        const v = metric === "volume" ? r.cit_volume_mn : r.cit_value_cr;
        return { app: r.app_name, share: total ? (v / total) * 100 : 0 };
      });
    };
    return {
      now: calc(current),
      six: calc(sixAgo),
      twelve: calc(twelveAgo),
    };
  }, [current, sixAgo, twelveAgo, metric]);

  const shareForSelected = useMemo(() => {
    const get = (rows: { app: string; share: number }[], app: string) =>
      rows.find((r) => r.app === app)?.share ?? 0;
    return selected.map((app, i) => ({
      app,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      now: get(sharePeriods.now, app),
      six: get(sharePeriods.six, app),
      twelve: get(sharePeriods.twelve, app),
    }));
  }, [selected, sharePeriods]);

  // For stacked horizontal bar
  const sortedByShare = useMemo(
    () => [...sharePeriods.now].sort((a, b) => b.share - a.share),
    [sharePeriods.now],
  );
  const top6Share = sortedByShare.slice(0, 6);
  const otherShare = sortedByShare.slice(6).reduce((a, b) => a + b.share, 0);

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Insight cards */}
      <BentoCard className="col-span-12 md:col-span-4 min-h-[180px]">
        <CardLabel>Ecosystem</CardLabel>
        <p className="mt-3 font-serif text-5xl">
          {insights ? `${insights.ecosystem >= 0 ? "+" : ""}${insights.ecosystem.toFixed(1)}%` : "—"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Aggregate {metric === "volume" ? "volume" : "value"} change vs previous month.
        </p>
      </BentoCard>
      <BentoCard className="col-span-12 md:col-span-4 min-h-[180px]" delay={80}>
        <CardLabel>Fastest grower</CardLabel>
        <p className="mt-3 font-serif text-3xl">{insights?.gainer?.name ?? "—"}</p>
        <p className="mt-2 font-mono text-sm text-emerald-600">
          {insights ? `+${insights.gainer.pct.toFixed(1)}% MoM` : ""}
        </p>
      </BentoCard>
      <BentoCard className="col-span-12 md:col-span-4 min-h-[180px]" delay={160}>
        <CardLabel>Biggest decliner</CardLabel>
        <p className="mt-3 font-serif text-3xl">{insights?.decliner?.name ?? "—"}</p>
        <p className="mt-2 font-mono text-sm text-rose-600">
          {insights ? `${insights.decliner.pct.toFixed(1)}% MoM` : ""}
        </p>
      </BentoCard>

      {/* App selector */}
      <BentoCard className="col-span-12" delay={220}>
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <CardLabel>Compare</CardLabel>
              <h3 className="font-serif text-2xl mt-1">
                Pick up to 5 apps to chart
              </h3>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {selected.length}/5 selected
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {allApps.map((app) => {
              const isSel = selected.includes(app);
              return (
                <button
                  key={app}
                  onClick={() => {
                    if (isSel) {
                      setSelected(selected.filter((a) => a !== app));
                    } else if (selected.length < 5) {
                      setSelected([...selected, app]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isSel
                      ? "bg-foreground text-background"
                      : "bg-foreground/5 text-foreground hover:bg-foreground/10"
                  }`}
                >
                  {app}
                </button>
              );
            })}
          </div>
        </div>
      </BentoCard>

      {/* Multi-line trend */}
      <BentoCard className="col-span-12 min-h-[420px]" delay={280}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardLabel>24-month trajectory</CardLabel>
            <h3 className="font-serif text-2xl mt-1">
              {metric === "volume" ? "Transaction volume" : "Transaction value"} over time
            </h3>
          </div>
          <div className="flex gap-3 flex-wrap">
            {selected.map((app, i) => (
              <span key={app} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2 rounded-full"
                  style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
                {app}
              </span>
            ))}
          </div>
        </div>
        <div className="h-[340px] w-full">
          <ResponsiveContainer>
            <LineChart data={trendRows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--color-muted-foreground)"
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.floor(trendRows.length / 8))}
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
                formatter={(v: number, name) => [
                  metric === "volume" ? `${(v as number).toFixed(1)}M` : `₹${formatIndianNumber(v as number)} Cr`,
                  name,
                ]}
              />
              {selected.map((app, i) => (
                <Line
                  key={app}
                  type="monotone"
                  dataKey={metric === "volume" ? app : `${app}__value`}
                  name={app}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </BentoCard>

      {/* Market share stacked bar */}
      <BentoCard className="col-span-12 lg:col-span-7 min-h-[260px]" delay={340}>
        <CardLabel>Market share · {month} {year}</CardLabel>
        <h3 className="font-serif text-2xl mt-1 mb-6">Who owns the ecosystem</h3>
        <div className="w-full h-8 rounded-full overflow-hidden flex bg-foreground/5">
          {top6Share.map((s, i) => (
            <div
              key={s.app}
              className="h-full flex items-center justify-center text-[10px] font-mono text-white relative group"
              style={{
                width: `${s.share}%`,
                background: SERIES_COLORS[i % SERIES_COLORS.length],
                minWidth: s.share > 2 ? undefined : 0,
              }}
              title={`${s.app} · ${s.share.toFixed(1)}%`}
            >
              {s.share > 6 ? `${s.share.toFixed(1)}%` : ""}
            </div>
          ))}
          {otherShare > 0 && (
            <div
              className="h-full bg-foreground/30 flex items-center justify-center text-[10px] font-mono text-white"
              style={{ width: `${otherShare}%` }}
              title={`Others · ${otherShare.toFixed(1)}%`}
            >
              {otherShare > 6 ? `${otherShare.toFixed(1)}%` : ""}
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          {top6Share.map((s, i) => (
            <span key={s.app} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 rounded-sm"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="font-medium">{s.app}</span>
              <span className="font-mono text-muted-foreground">{s.share.toFixed(1)}%</span>
            </span>
          ))}
          {otherShare > 0 && (
            <span className="flex items-center gap-2 text-xs">
              <span className="size-2 rounded-sm bg-foreground/30" />
              <span className="font-medium">Others</span>
              <span className="font-mono text-muted-foreground">{otherShare.toFixed(1)}%</span>
            </span>
          )}
        </div>
      </BentoCard>

      {/* Period comparison */}
      <BentoCard className="col-span-12 lg:col-span-5 min-h-[260px]" delay={400}>
        <CardLabel>Share · now vs −6m vs −12m</CardLabel>
        <h3 className="font-serif text-2xl mt-1 mb-4">Trajectory check</h3>
        <div className="space-y-3">
          {shareForSelected.length === 0 && (
            <p className="text-sm text-muted-foreground">Select apps above to compare.</p>
          )}
          {shareForSelected.map((s) => (
            <div key={s.app} className="grid grid-cols-[120px_1fr_1fr_1fr] gap-3 items-center">
              <span className="flex items-center gap-2 text-sm font-medium truncate">
                <span className="size-2 rounded-sm" style={{ background: s.color }} />
                {s.app}
              </span>
              <Cell value={s.twelve} label="−12m" />
              <Cell value={s.six} label="−6m" />
              <Cell value={s.now} label="now" highlight />
            </div>
          ))}
        </div>
      </BentoCard>
    </div>
  );
}

function Cell({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div className={`text-right ${highlight ? "text-primary" : "text-muted-foreground"}`}>
      <p className="font-mono text-[9px] uppercase tracking-widest">{label}</p>
      <p className={`font-mono ${highlight ? "text-base font-semibold" : "text-sm"}`}>
        {value.toFixed(1)}%
      </p>
    </div>
  );
}
