import { memo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { useDashboardState } from "@/components/upi/DashboardContext";
import { useStates, useStatewiseTrend } from "@/lib/upi/hooks";
import { AXIS_TICK } from "./constants";

const STATE_TOOLTIP_STYLE = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--border)",
  borderRadius: 8,
} as const;

export const StateGrowthCard = memo(function StateGrowthCard({
  selectedState,
  onChangeState,
}: {
  selectedState: string;
  onChangeState: (state: string) => void;
}) {
  const { metric } = useDashboardState();
  const allStates = useStates();
  const stateTrend = useStatewiseTrend(selectedState);

  return (
    <BentoCard className="col-span-12" delay={500}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <CardLabel>State growth</CardLabel>
          <h3 className="font-serif text-2xl mt-1">Month-on-month growth by state</h3>
        </div>
        <select
          value={selectedState}
          onChange={(e) => onChangeState(e.target.value)}
          className="font-mono text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground"
        >
          {allStates.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>
      {stateTrend.filter((p) => p.mom_volume_pct !== null).length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest py-8 text-center">
          No trend data available
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={stateTrend.filter((p) =>
              metric === "volume" ? p.mom_volume_pct !== null : p.mom_value_pct !== null,
            )}
            margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} />
            <Tooltip
              contentStyle={STATE_TOOLTIP_STYLE}
              formatter={(v: number) => [`${v.toFixed(2)}%`, "MoM growth"]}
            />
            <Line
              type="monotone"
              dataKey={metric === "volume" ? "mom_volume_pct" : "mom_value_pct"}
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </BentoCard>
  );
});
