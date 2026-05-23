import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useDashboard } from "@/components/upi/DashboardContext";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { Sparkline } from "@/components/upi/Sparkline";
import { AppLink } from "@/components/upi/AppLink";
import {
  getMonthData,
  getPreviousMonth,
  getAppTrend,
  formatNumber,
  formatIndianNumber,
} from "@/lib/upi/queries";
import { generateNarrative } from "@/lib/upi/insights";
import { AppMonthData } from "@/lib/upi/types";

export const Route = createFileRoute("/dashboard/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { year, month, metric } = useDashboard();
  const [current, setCurrent] = useState<AppMonthData[]>([]);
  const [previous, setPrevious] = useState<AppMonthData[]>([]);
  const [leaderTrend, setLeaderTrend] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const cur = await getMonthData(year, month);
      const prev = getPreviousMonth(year, month);
      const prevData = prev ? await getMonthData(prev.year, prev.month) : [];
      if (cancelled) return;
      setCurrent(cur);
      setPrevious(prevData);

      const leader = [...cur].sort((a, b) =>
        metric === "volume" ? b.cit_volume_mn - a.cit_volume_mn : b.cit_value_cr - a.cit_value_cr,
      )[0];
      if (leader) {
        const trend = await getAppTrend(leader.app_name, 12, year, month);
        if (!cancelled) {
          setLeaderTrend(
            trend.map((p) => (metric === "volume" ? p.cit_volume_mn : p.cit_value_cr)),
          );
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month, metric]);

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

  const leader = sorted[0];
  const runnerUp = sorted[1];
  const leaderShare = leader && total ? ((metric === "volume" ? leader.cit_volume_mn : leader.cit_value_cr) / total) * 100 : 0;
  const runnerShare = runnerUp && total ? ((metric === "volume" ? runnerUp.cit_volume_mn : runnerUp.cit_value_cr) / total) * 100 : 0;

  const top4 = sorted.slice(0, 4);
  const top10 = sorted.slice(0, 10);

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

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Hero */}
      <BentoCard className="col-span-12 lg:col-span-8 min-h-[340px] flex flex-col justify-between">
        <div className="flex justify-between items-start gap-4">
          <div>
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
          <CardLabel>Leader trajectory · last 12 months</CardLabel>
          <div className="mt-2 text-primary">
            <Sparkline values={leaderTrend} height={72} />
          </div>
        </div>
      </BentoCard>

      {/* Market Leader */}
      <BentoCard
        tone="primary"
        delay={80}
        className="col-span-12 lg:col-span-4 min-h-[340px] flex flex-col justify-between"
      >
        <div>
          <span className="inline-flex px-3 py-1 rounded-full bg-white/15 font-mono text-[10px] uppercase tracking-widest">
            Dominance
          </span>
          <h3 className="mt-5 font-serif text-3xl lg:text-4xl leading-tight">
            <em className="italic">{leader?.app_name ?? "—"}</em> leads with {leaderShare.toFixed(1)}% share.
          </h3>
        </div>
        <div className="pt-6 border-t border-white/15">
          <p className="text-white/70 text-sm mb-4">
            Runner-up: {runnerUp?.app_name ?? "—"} ({runnerShare.toFixed(1)}%)
          </p>
          <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden flex">
            <div className="h-full bg-white" style={{ width: `${leaderShare}%` }} />
            <div className="h-full bg-white/40" style={{ width: `${runnerShare}%` }} />
          </div>
        </div>
      </BentoCard>

      {/* Top 4 cards */}
      {top4.map((row, i) => {
        const value = metric === "volume" ? row.cit_volume_mn : row.cit_value_cr;
        const share = total ? (value / total) * 100 : 0;
        return (
          <BentoCard
            key={row.app_name}
            delay={160 + i * 60}
            className="col-span-12 md:col-span-6 lg:col-span-3 min-h-[180px] flex flex-col justify-between hover:ring-primary/30 transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-mono font-semibold text-sm">
                {row.app_name.slice(0, 2).toUpperCase()}
              </div>
              <span className="font-mono text-xs text-muted-foreground">#0{i + 1}</span>
            </div>
            <div className="mt-6">
              <h4 className="font-serif text-2xl">{row.app_name}</h4>
              <p className="mt-1 font-mono text-2xl font-medium text-primary tabular-nums">
                {metric === "volume"
                  ? `${formatNumber(row.cit_volume_mn * 1e6, 1)}`
                  : `₹${formatIndianNumber(row.cit_value_cr)} Cr`}
              </p>
              <div className="mt-3 h-1 w-full bg-foreground/5 rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {share.toFixed(2)}% share
              </p>
            </div>
          </BentoCard>
        );
      })}

      {/* Top 10 ranked list */}
      <BentoCard className="col-span-12 lg:col-span-7" delay={420}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <CardLabel>Top 10 · {metric === "volume" ? "by volume" : "by value"}</CardLabel>
            <h3 className="font-serif text-2xl mt-1">Leaderboard</h3>
          </div>
        </div>
        <ol className="space-y-1">
          {top10.map((row, i) => {
            const value = metric === "volume" ? row.cit_volume_mn : row.cit_value_cr;
            const max = metric === "volume" ? top10[0].cit_volume_mn : top10[0].cit_value_cr;
            const w = (value / max) * 100;
            return (
              <li
                key={row.app_name}
                className="grid grid-cols-[28px_140px_1fr_auto] items-center gap-4 py-2 border-b border-foreground/[0.04] last:border-0"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-medium text-sm truncate">{row.app_name}</span>
                <div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: `${w}%`, transition: "width .6s cubic-bezier(.16,1,.3,1)" }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums text-right w-24">
                  {metric === "volume"
                    ? `${row.cit_volume_mn.toFixed(1)}M`
                    : `₹${formatIndianNumber(row.cit_value_cr)}`}
                </span>
              </li>
            );
          })}
        </ol>
      </BentoCard>

      {/* Coverage Card */}
      <BentoCard tone="dark" className="col-span-12 lg:col-span-5" delay={480}>
        <CardLabel className="text-background/60">Ecosystem</CardLabel>
        <h3 className="font-serif text-3xl lg:text-4xl mt-3 leading-tight">
          {current.length} apps processed{" "}
          <em className="italic text-primary-foreground/80">{totalDisplay}</em> in {month} {year}.
        </h3>
        <p className="mt-6 text-background/60 text-sm leading-relaxed">
          PhonePe + Google Pay continue to anchor more than four-fifths of all UPI consumer
          transactions, while a long tail of fintech challengers — Navi, super.money, Cred —
          fight for the remaining share.
        </p>
        <div className="mt-8 grid grid-cols-3 gap-4">
          <Stat label="Apps" value={String(current.length)} />
          <Stat
            label="Top 2 share"
            value={`${(((sorted[0]?.cit_volume_mn ?? 0) + (sorted[1]?.cit_volume_mn ?? 0)) / (current.reduce((a, b) => a + b.cit_volume_mn, 0) || 1) * 100).toFixed(0)}%`}
          />
          <Stat
            label="MoM"
            value={`${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%`}
          />
        </div>
      </BentoCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">{label}</p>
      <p className="font-serif text-2xl mt-1">{value}</p>
    </div>
  );
}
