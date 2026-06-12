import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useDashboard } from "@/components/upi/DashboardContext";
import { RankMovers } from "@/components/upi/RankMovers";
import { InsightCards } from "@/components/upi/trends/InsightCards";
import { MarketShareCard } from "@/components/upi/trends/MarketShareCard";
import { TrajectoryCard } from "@/components/upi/trends/TrajectoryCard";
import { PremiumnessCard } from "@/components/upi/trends/PremiumnessCard";
import { TicketSizeCard } from "@/components/upi/trends/TicketSizeCard";
import { StateGrowthCard } from "@/components/upi/trends/StateGrowthCard";
import { ShareComparisonCard } from "@/components/upi/trends/ShareComparisonCard";
import { getMonthOffset, getPreviousMonth } from "@/lib/upi/queries";
import {
  multiAppTrendFrom,
  useAllMonths,
  useMonthData,
  useStates,
  useUniqueApps,
} from "@/lib/upi/hooks";
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

const EMPTY_ROWS: AppMonthData[] = [];

function TrendsPage() {
  const { year, month, metric } = useDashboard();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState<string>("MAHARASHTRA");

  const { rows: current } = useMonthData(year, month);
  const prevM = getPreviousMonth(year, month);
  const { rows: prev } = useMonthData(prevM?.year ?? null, prevM?.month ?? null);
  const { allMonths } = useAllMonths();
  const allApps = useUniqueApps();
  const allStates = useStates();

  // −6m / −12m snapshots come straight from the shared history
  const sixAgo = useMemo(() => {
    const o = getMonthOffset(year, month, 6);
    if (!o) return EMPTY_ROWS;
    return allMonths.find((b) => b.year === o.year && b.month_num === o.month_num)?.rows ?? EMPTY_ROWS;
  }, [allMonths, year, month]);
  const twelveAgo = useMemo(() => {
    const o = getMonthOffset(year, month, 12);
    if (!o) return EMPTY_ROWS;
    return allMonths.find((b) => b.year === o.year && b.month_num === o.month_num)?.rows ?? EMPTY_ROWS;
  }, [allMonths, year, month]);

  const trendRows = useMemo(
    () =>
      allMonths.length && selected.length
        ? multiAppTrendFrom(allMonths, selected, 24, year, month)
        : [],
    [allMonths, selected, year, month],
  );

  // Default selection: top-3 apps by volume, set once when data first arrives
  const defaultsSet = useRef(false);
  useEffect(() => {
    if (defaultsSet.current || selected.length > 0 || !current.length) return;
    defaultsSet.current = true;
    setSelected(
      [...current]
        .sort((a, b) => b.cit_volume_mn - a.cit_volume_mn)
        .slice(0, 3)
        .map((r) => r.app_name),
    );
  }, [current, selected.length]);

  // Fall back to the first state when the default isn't in the data
  useEffect(() => {
    if (allStates.length > 0 && !allStates.includes(selectedState)) {
      setSelectedState(allStates[0]);
    }
  }, [allStates, selectedState]);

  return (
    <div className="grid grid-cols-12 gap-5">
      <InsightCards current={current} prev={prev} />
      <MarketShareCard current={current} />
      <RankMovers current={current} previous={prev} metric={metric} delays={[180, 220]} />
      <TrajectoryCard
        selected={selected}
        onChangeSelected={setSelected}
        allApps={allApps}
        trendRows={trendRows}
      />
      <PremiumnessCard current={current} />
      <TicketSizeCard selected={selected} trendRows={trendRows} current={current} />
      <StateGrowthCard selectedState={selectedState} onChangeState={setSelectedState} />
      <ShareComparisonCard
        selected={selected}
        current={current}
        sixAgo={sixAgo}
        twelveAgo={twelveAgo}
      />
    </div>
  );
}
