import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell as ChartCell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { AppLink } from "@/components/upi/AppLink";
import { useDashboardState } from "@/components/upi/DashboardContext";
import { premiumnessIndex } from "@/lib/upi/insights";
import { AppMonthData } from "@/lib/upi/types";
import { AXIS_TICK_SM, TOOLTIP_STYLE_SM } from "./constants";

export const PremiumnessCard = memo(function PremiumnessCard({
  current,
}: {
  current: AppMonthData[];
}) {
  const { year, month } = useDashboardState();

  // Premiumness (value share ÷ volume share) for the current month's top-15 apps by volume
  const premiumness = useMemo(() => {
    if (!current.length) return [];
    const top15 = new Set(
      [...current]
        .sort((a, b) => b.cit_volume_mn - a.cit_volume_mn)
        .slice(0, 15)
        .map((r) => r.app_name),
    );
    return premiumnessIndex(current).filter((p) => top15.has(p.app));
  }, [current]);

  return (
    <BentoCard className="col-span-12 min-h-[420px]" delay={318}>
      <div className="mb-4">
        <CardLabel>Premiumness · value share ÷ volume share</CardLabel>
        <h3 className="font-serif text-2xl mt-1">Who punches above their weight in value?</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col justify-between gap-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            An index above 1× means an app's share of UPI <em>value</em> exceeds its share of
            transaction <em>count</em> — it skews toward large-ticket payments. Below 1× means
            the app lives on micro-transactions. Computed for {month} {year} across the top 15
            apps by volume.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {premiumness.length > 0 && (
              <>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Most premium</p>
                  <p className="font-serif text-2xl mt-1"><AppLink app={premiumness[0].app} /></p>
                  <p className="font-mono text-sm text-emerald-600 mt-0.5">{premiumness[0].index.toFixed(2)}×</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Most micro</p>
                  <p className="font-serif text-2xl mt-1"><AppLink app={premiumness[premiumness.length - 1].app} /></p>
                  <p className="font-mono text-sm text-rose-600 mt-0.5">{premiumness[premiumness.length - 1].index.toFixed(2)}×</p>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="h-[340px]">
          <ResponsiveContainer>
            <BarChart data={premiumness} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis
                type="number"
                tick={AXIS_TICK_SM}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}×`}
              />
              <YAxis
                dataKey="app"
                type="category"
                tick={AXIS_TICK_SM}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE_SM}
                formatter={(v: number) => [`${(v as number).toFixed(2)}×`, "Premiumness"]}
              />
              <ReferenceLine x={1} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.5} />
              <Bar dataKey="index" radius={[0, 4, 4, 0]} fillOpacity={0.75}>
                {premiumness.map((p) => (
                  <ChartCell
                    key={p.app}
                    fill={p.index >= 1 ? "var(--color-chart-1)" : "var(--color-chart-3)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </BentoCard>
  );
});
