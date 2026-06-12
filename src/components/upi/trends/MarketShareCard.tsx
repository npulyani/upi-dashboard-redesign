import { memo, useMemo } from "react";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { useDashboardState } from "@/components/upi/DashboardContext";
import { AppMonthData } from "@/lib/upi/types";
import { SERIES_COLORS } from "./constants";

export const MarketShareCard = memo(function MarketShareCard({
  current,
}: {
  current: AppMonthData[];
}) {
  const { year, month, metric } = useDashboardState();

  const sortedByShare = useMemo(() => {
    const total = current.reduce(
      (a, b) => a + (metric === "volume" ? b.cit_volume_mn : b.cit_value_cr),
      0,
    );
    return current
      .map((r) => {
        const v = metric === "volume" ? r.cit_volume_mn : r.cit_value_cr;
        return { app: r.app_name, share: total ? (v / total) * 100 : 0 };
      })
      .sort((a, b) => b.share - a.share);
  }, [current, metric]);

  const top6Share = sortedByShare.slice(0, 6);
  const otherShare = sortedByShare.slice(6).reduce((a, b) => a + b.share, 0);

  return (
    <BentoCard className="col-span-12" delay={120}>
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
  );
});
