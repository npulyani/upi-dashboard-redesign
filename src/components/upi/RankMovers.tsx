import { memo, useMemo } from "react";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { AppLink } from "@/components/upi/AppLink";
import { AppLogo } from "@/components/upi/AppLogo";
import { RankBadge } from "@/components/upi/RankBadge";
import { rankChanges } from "@/lib/upi/insights";
import { AppMonthData, Metric } from "@/lib/upi/types";

type Mover = { app: string; previous: number; current: number; delta: number };

function MoverList({ movers, logoMap }: { movers: Mover[]; logoMap: Map<string, string | null> }) {
  return (
    <ul className="mt-4 space-y-2">
      {movers.length === 0 && (
        <li className="text-sm text-muted-foreground">No rank changes yet.</li>
      )}
      {movers.map((m) => (
        <li key={m.app} className="flex items-center justify-between gap-3 py-1.5 border-b border-foreground/[0.04] last:border-0">
          <span className="flex items-center gap-3">
            <RankBadge delta={m.delta} />
            <AppLogo app={m.app} domain={logoMap.get(m.app)} size={22} />
            <span className="font-medium text-sm"><AppLink app={m.app} /></span>
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            #{m.previous} → #{m.current}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The "Rank climbers / Rank fallers" card pair, shared by Overview and Trends. */
export const RankMovers = memo(function RankMovers({
  current,
  previous,
  metric,
  delays = [0, 40],
}: {
  current: AppMonthData[];
  previous: AppMonthData[];
  metric: Metric;
  delays?: [number, number];
}) {
  const movers = useMemo(() => {
    if (!current.length || !previous.length) return { climbers: [] as Mover[], fallers: [] as Mover[] };
    const ch = rankChanges(current, previous, metric).filter((c) => c.delta !== 0);
    const climbers = [...ch].sort((a, b) => b.delta - a.delta).slice(0, 3);
    const fallers = [...ch].sort((a, b) => a.delta - b.delta).slice(0, 3);
    return { climbers, fallers };
  }, [current, previous, metric]);

  const logoMap = useMemo(
    () => new Map(current.map((r) => [r.app_name, r.logo_domain ?? null])),
    [current],
  );

  return (
    <>
      <BentoCard className="col-span-12 md:col-span-6 min-h-[180px]" delay={delays[0]}>
        <CardLabel>Rank climbers · this month</CardLabel>
        <MoverList movers={movers.climbers} logoMap={logoMap} />
      </BentoCard>
      <BentoCard className="col-span-12 md:col-span-6 min-h-[180px]" delay={delays[1]}>
        <CardLabel>Rank fallers · this month</CardLabel>
        <MoverList movers={movers.fallers} logoMap={logoMap} />
      </BentoCard>
    </>
  );
});
