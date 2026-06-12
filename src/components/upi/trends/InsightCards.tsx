import { memo, useMemo } from "react";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { AppLink } from "@/components/upi/AppLink";
import { useDashboardState } from "@/components/upi/DashboardContext";
import { useSeasonalityMatrix } from "@/lib/upi/hooks";
import { AppMonthData } from "@/lib/upi/types";

/** "Ecosystem MoM" (with seasonal adjustment) + "Fastest MoM grower" card pair. */
export const InsightCards = memo(function InsightCards({
  current,
  prev,
}: {
  current: AppMonthData[];
  prev: AppMonthData[];
}) {
  const { year, month, metric } = useDashboardState();

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

  // Seasonally-adjusted ecosystem MoM: raw MoM minus the average MoM for this
  // calendar month across all years (the delta_from_avg of the ecosystem matrix)
  const seasonalityMatrix = useSeasonalityMatrix(metric);
  const seasonalAdj = useMemo(() => {
    for (const row of seasonalityMatrix) {
      for (const cell of row) {
        if (cell.year === year && cell.month === month) return cell.delta_from_avg;
      }
    }
    return null;
  }, [seasonalityMatrix, year, month]);

  return (
    <>
      <BentoCard className="col-span-12 md:col-span-6 min-h-[160px]">
        <CardLabel>Ecosystem MoM</CardLabel>
        <p className="mt-3 font-serif text-5xl">
          {insights ? `${insights.ecosystem >= 0 ? "+" : ""}${insights.ecosystem.toFixed(1)}%` : "—"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Aggregate {metric === "volume" ? "volume" : "value"} vs previous month.
        </p>
        {seasonalAdj !== null && (
          <p
            className="mt-2 font-mono text-xs"
            title={`Raw MoM minus the average MoM for ${month} across all years — strips the festival effect.`}
          >
            <span className={seasonalAdj >= 0 ? "text-emerald-600" : "text-rose-600"}>
              {seasonalAdj >= 0 ? "+" : ""}{seasonalAdj.toFixed(1)} pp
            </span>{" "}
            <span className="text-muted-foreground uppercase tracking-widest text-[10px]">
              seasonally adjusted · vs typical {month}
            </span>
          </p>
        )}
      </BentoCard>
      <BentoCard className="col-span-12 md:col-span-6 min-h-[160px]" delay={80}>
        <CardLabel>Fastest MoM grower</CardLabel>
        <p className="mt-3 font-serif text-3xl">
          {insights?.gainer ? <AppLink app={insights.gainer.name} /> : "—"}
        </p>
        <p className="mt-2 font-mono text-sm text-emerald-600">
          {insights ? `+${insights.gainer.pct.toFixed(1)}% MoM` : ""}
        </p>
      </BentoCard>
    </>
  );
});
