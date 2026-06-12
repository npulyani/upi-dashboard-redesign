import { memo, useMemo } from "react";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { useDashboardState } from "@/components/upi/DashboardContext";
import { AppMonthData } from "@/lib/upi/types";
import { SERIES_COLORS } from "./constants";

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

export const ShareComparisonCard = memo(function ShareComparisonCard({
  selected,
  current,
  sixAgo,
  twelveAgo,
}: {
  selected: string[];
  current: AppMonthData[];
  sixAgo: AppMonthData[];
  twelveAgo: AppMonthData[];
}) {
  const { metric } = useDashboardState();

  const shareForSelected = useMemo(() => {
    const calc = (rows: AppMonthData[]) => {
      const total = rows.reduce(
        (a, b) => a + (metric === "volume" ? b.cit_volume_mn : b.cit_value_cr),
        0,
      );
      return new Map(
        rows.map((r) => {
          const v = metric === "volume" ? r.cit_volume_mn : r.cit_value_cr;
          return [r.app_name, total ? (v / total) * 100 : 0];
        }),
      );
    };
    const now = calc(current);
    const six = calc(sixAgo);
    const twelve = calc(twelveAgo);
    return selected.map((app, i) => ({
      app,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      now: now.get(app) ?? 0,
      six: six.get(app) ?? 0,
      twelve: twelve.get(app) ?? 0,
    }));
  }, [selected, current, sixAgo, twelveAgo, metric]);

  return (
    <BentoCard className="col-span-12" delay={400}>
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
  );
});
