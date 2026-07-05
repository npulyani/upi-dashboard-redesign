import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDashboard } from "@/components/upi/DashboardContext";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { YearCalendar } from "@/components/upi/YearCalendar";
import { formatNumber, formatIndianNumber } from "@/lib/upi/queries";
import { useAllMonths, useAvailableMonths } from "@/lib/upi/hooks";
import { totalFor, ranked } from "@/lib/upi/insights";
import { AppMonthData } from "@/lib/upi/types";

export const Route = createFileRoute("/dashboard/year")({
  head: () => ({
    meta: [{ title: "Year Review — State of UPI" }],
  }),
  component: YearReviewPage,
});

interface MonthCell {
  year: number;
  month: string;
  month_num: number;
  current: AppMonthData[];
  previous: AppMonthData[];
}

function YearReviewPage() {
  const { metric, setMonthYear, year: contextYear } = useDashboard();
  const navigate = useNavigate();
  const { availableMonths } = useAvailableMonths();

  const YEARS = useMemo(() => Array.from(new Set(availableMonths.map((m) => m.year))), [availableMonths]);
  const defaultYear = YEARS.includes(contextYear) ? contextYear : YEARS[YEARS.length - 1];
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);

  const { allMonths, isPending: loading } = useAllMonths();

  // Year cells (with previous month for MoM), derived from the shared history
  const cells = useMemo<MonthCell[]>(() => {
    if (!allMonths.length) return [];
    const dataMap = new Map(allMonths.map((b) => [`${b.year}-${b.month_num}`, b.rows]));
    return availableMonths.filter((m) => m.year === selectedYear).map((m) => {
      const prevIdx =
        availableMonths.findIndex((x) => x.year === m.year && x.month_num === m.month_num) - 1;
      const prev = prevIdx >= 0 ? availableMonths[prevIdx] : null;
      return {
        year: m.year,
        month: m.month,
        month_num: m.month_num,
        current: dataMap.get(`${m.year}-${m.month_num}`) ?? [],
        previous: prev ? (dataMap.get(`${prev.year}-${prev.month_num}`) ?? []) : [],
      };
    });
  }, [allMonths, availableMonths, selectedYear]);

  // Year summary stats
  const yearStats = useMemo(() => {
    if (!cells.length) return null;
    const totals = cells.map((c) => totalFor(c.current, metric));
    const totalYear = totals.reduce((a, b) => a + b, 0);
    const peakCell = cells[totals.indexOf(Math.max(...totals))];
    const peakTotal = Math.max(...totals);
    const leaders = cells.map((c) => ranked(c.current, metric)[0]?.app_name ?? "").filter(Boolean);
    const leaderCounts = leaders.reduce<Record<string, number>>((acc, app) => {
      acc[app] = (acc[app] ?? 0) + 1;
      return acc;
    }, {});
    const dominantLeader = Object.entries(leaderCounts).sort((a, b) => b[1] - a[1])[0];

    // YoY vs previous year
    const firstCell = cells.find((c) => c.previous.length > 0);
    const lastCell = [...cells].reverse().find((c) => c.previous.length > 0);
    let yoyGrowth: number | null = null;
    if (firstCell && lastCell) {
      const prevYearTotal = cells.reduce((a, c) => a + totalFor(c.previous, metric), 0);
      yoyGrowth = prevYearTotal > 0 ? ((totalYear - prevYearTotal) / prevYearTotal) * 100 : null;
    }

    return { totalYear, peakCell, peakTotal, dominantLeader, yoyGrowth };
  }, [cells, metric]);

  function handleSelectMonth(year: number, month: string) {
    setMonthYear(year, month);
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Header */}
      <BentoCard className="col-span-12" tone="dark">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardLabel className="text-background/60">Year in review · {metric}</CardLabel>
            <h2 className="font-serif text-4xl mt-1 text-background">{selectedYear}</h2>
          </div>
          <div className="inline-flex items-center bg-background/10 p-1 rounded-full ring-1 ring-white/10">
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
                  selectedYear === y
                    ? "bg-background/20 text-background shadow-sm"
                    : "text-background/60 hover:text-background"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {yearStats && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">
                Full-year {metric}
              </p>
              <p className="font-serif text-2xl mt-1 text-background">
                {metric === "volume"
                  ? formatNumber(yearStats.totalYear * 1e6, 1)
                  : `₹${formatIndianNumber(yearStats.totalYear)} Cr`}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">Peak month</p>
              <p className="font-serif text-2xl mt-1 text-background">
                {yearStats.peakCell?.month ?? "—"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">#1 leader</p>
              <p className="font-serif text-2xl mt-1 text-background truncate">
                {yearStats.dominantLeader?.[0] ?? "—"}
              </p>
              {yearStats.dominantLeader && (
                <p className="font-mono text-[9px] text-background/50">
                  {yearStats.dominantLeader[1]} of 12 months
                </p>
              )}
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">YoY growth</p>
              <p className={`font-serif text-2xl mt-1 ${yearStats.yoyGrowth !== null ? (yearStats.yoyGrowth >= 0 ? "text-emerald-300" : "text-rose-300") : "text-background"}`}>
                {yearStats.yoyGrowth !== null
                  ? `${yearStats.yoyGrowth >= 0 ? "+" : ""}${yearStats.yoyGrowth.toFixed(1)}%`
                  : "—"}
              </p>
            </div>
          </div>
        )}
      </BentoCard>

      {/* Calendar grid */}
      <BentoCard className="col-span-12">
        <CardLabel>Monthly breakdown</CardLabel>
        <p className="text-sm text-muted-foreground mt-1 mb-5">
          Click any month to jump to its overview.
        </p>
        {loading ? (
          <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest py-12 text-center">
            Loading {selectedYear}…
          </p>
        ) : (
          <YearCalendar cells={cells} metric={metric} onSelectMonth={handleSelectMonth} />
        )}
      </BentoCard>
    </div>
  );
}
