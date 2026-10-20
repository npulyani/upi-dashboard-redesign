import { memo, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { AppLogo } from "@/components/upi/AppLogo";
import { HoverTip, TipContent, useHoverTip } from "@/components/upi/HoverTip";
import { appTipLines, signedPct } from "@/lib/upi/appTip";
import { AppMonthData, Metric } from "@/lib/upi/types";

/** Apps below this previous-month volume swing wildly in % terms, so they're left out. */
const MIN_PREV_VOLUME_MN = 10;
const PER_SIDE = 6;

type Mover = { row: AppMonthData; prev: AppMonthData; change: number };

/** "Biggest movers vs <prev month>" — % change in the selected metric, as diverging bars. */
export const BiggestMovers = memo(function BiggestMovers({
  current,
  previous,
  metric,
  total,
  prevLabel,
  delay = 0,
}: {
  current: AppMonthData[];
  previous: AppMonthData[];
  metric: Metric;
  /** Ecosystem total for the selected metric, used for share in the tooltip. */
  total: number;
  prevLabel: string;
  delay?: number;
}) {
  const { ref, tip, show, hide } = useHoverTip();

  const { gainers, losers, max } = useMemo(() => {
    const prevBy = new Map(previous.map((r) => [r.app_name, r]));
    const pick = (r: AppMonthData) => (metric === "volume" ? r.cit_volume_mn : r.cit_value_cr);
    const movers: Mover[] = [];
    for (const row of current) {
      const prev = prevBy.get(row.app_name);
      if (!prev || prev.cit_volume_mn < MIN_PREV_VOLUME_MN || pick(prev) <= 0) continue;
      movers.push({ row, prev, change: (pick(row) / pick(prev) - 1) * 100 });
    }
    movers.sort((a, b) => b.change - a.change);
    const gainers = movers.filter((m) => m.change > 0).slice(0, PER_SIDE);
    const losers = movers.filter((m) => m.change < 0).slice(-PER_SIDE);
    const max = Math.max(1, ...[...gainers, ...losers].map((m) => Math.abs(m.change)));
    return { gainers, losers, max };
  }, [current, previous, metric]);

  if (!previous.length) return null;

  const tipFor = (m: Mover): TipContent => ({
    title: m.row.app_name,
    lines: [
      {
        label: `${metric === "volume" ? "Volume" : "Value"} vs ${prevLabel}`,
        value: signedPct(m.change),
        tone: m.change >= 0 ? "up" : "down",
      },
      ...appTipLines(m.row, m.prev, metric, total, prevLabel),
    ],
  });

  const renderRow = (m: Mover) => {
    // Bars use up to 32% of the track per side, leaving room for the % label.
    const w = Math.max(0.5, (Math.abs(m.change) / max) * 32);
    const up = m.change >= 0;
    return (
      <Link
        key={m.row.app_name}
        to="/dashboard/app/$appName"
        params={{ appName: encodeURIComponent(m.row.app_name) }}
        onMouseMove={(e) => show(e, tipFor(m))}
        onMouseLeave={hide}
        className="grid grid-cols-[minmax(110px,180px)_1fr] items-center gap-3 py-1.5 rounded-lg px-2 -mx-2 hover:bg-foreground/[0.03] transition-colors group"
      >
        <span className="font-medium text-sm truncate inline-flex items-center gap-2.5 group-hover:text-primary transition-colors">
          <AppLogo app={m.row.app_name} domain={m.row.logo_domain} size={20} />
          {m.row.app_name}
        </span>
        <div className="relative h-5">
          <div className="absolute left-1/2 -top-1 -bottom-1 w-px bg-foreground/15" />
          <div
            className={`absolute top-0.5 h-4 rounded ${up ? "bg-primary/80" : "bg-foreground/20"}`}
            style={up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
          />
          <span
            className={`absolute top-0 leading-5 font-mono text-xs tabular-nums whitespace-nowrap ${
              up ? "text-emerald-600" : "text-rose-600"
            }`}
            style={up ? { left: `calc(50% + ${w}% + 6px)` } : { right: `calc(50% + ${w}% + 6px)` }}
          >
            {signedPct(m.change)}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <BentoCard className="col-span-12 min-h-[180px]" delay={delay}>
      <CardLabel>
        Biggest movers vs {prevLabel} · {metric === "volume" ? "volume" : "value"}
      </CardLabel>
      <h3 className="font-serif text-2xl mt-1">Who grew, who slipped</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Month-on-month change, apps with at least {MIN_PREV_VOLUME_MN} Mn transactions in{" "}
        {prevLabel}.
      </p>
      <div ref={ref} className="relative mt-5">
        {gainers.length === 0 && losers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movers to show.</p>
        ) : (
          <div className="space-y-1">
            {gainers.map(renderRow)}
            {gainers.length > 0 && losers.length > 0 && (
              <div className="h-px bg-foreground/[0.06] my-2" />
            )}
            {losers.map(renderRow)}
          </div>
        )}
        <HoverTip tip={tip} containerRef={ref} />
      </div>
    </BentoCard>
  );
});
