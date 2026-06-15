import { memo, useMemo, useState } from "react";
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
import { P2PMPoint } from "@/lib/upi/queryOptions";
import { formatIndianNumber } from "@/lib/upi/queries";

type ChartMetric = "volume" | "value";

function everyNthLabel(data: P2PMPoint[], n = 6) {
  return (value: string) => {
    const idx = data.findIndex((d) => d.label === value);
    return idx >= 0 && idx % n === 0 ? value : "";
  };
}

/** Stacked P2P vs P2M line chart with a local volume/value toggle (ported from Context). */
export const P2pP2mTrendChart = memo(function P2pP2mTrendChart({ data }: { data: P2PMPoint[] }) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>("volume");
  const tickFormatter = useMemo(() => everyNthLabel(data), [data]);
  const latest = data.at(-1);

  const yAxisVolFmt = (v: number) => `${(v / 1000).toFixed(0)}K Mn`;
  const yAxisValFmt = (v: number) => `₹${(v / 100000).toFixed(1)}L Cr`;

  const latestFooter = latest
    ? chartMetric === "volume"
      ? `Total ${(latest.total_volume_mn / 1000).toFixed(1)}K Mn txns`
      : `Total ₹${(latest.total_value_cr / 100000).toFixed(1)}L Cr`
    : null;

  return (
    <BentoCard className="col-span-12" delay={300}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <CardLabel>
            P2P vs P2M · {chartMetric === "volume" ? "Volume (Mn transactions)" : "Value (₹ Crore)"}
          </CardLabel>
          <h3 className="font-serif text-2xl mt-1">Merchant payments now dominate</h3>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex bg-foreground/[0.04] p-0.5 rounded-full text-xs font-medium ring-1 ring-black/5">
            <button
              onClick={() => setChartMetric("volume")}
              className={`px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${chartMetric === "volume" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Volume
            </button>
            <button
              onClick={() => setChartMetric("value")}
              className={`px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${chartMetric === "value" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Value
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm inline-block"
                style={{ background: "var(--color-chart-1)" }}
              />
              P2M
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm inline-block"
                style={{ background: "var(--color-chart-2)" }}
              />
              P2P
            </span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            strokeOpacity={0.4}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tickFormatter={tickFormatter}
            tick={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fill: "var(--color-muted-foreground)",
            }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={chartMetric === "volume" ? yAxisVolFmt : yAxisValFmt}
            tick={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fill: "var(--color-muted-foreground)",
            }}
            axisLine={false}
            tickLine={false}
            width={chartMetric === "volume" ? 52 : 64}
          />
          <Tooltip
            content={(props) => <StackedTooltip {...props} metric={chartMetric} />}
            cursor={{ stroke: "var(--color-foreground)", strokeOpacity: 0.15, strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey={chartMetric === "volume" ? "p2m_volume_mn" : "p2m_value_cr"}
            name="P2M"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey={chartMetric === "volume" ? "p2p_volume_mn" : "p2p_value_cr"}
            name="P2P"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          {chartMetric === "volume" && (
            <ReferenceLine
              x="Aug '22"
              stroke="var(--color-foreground)"
              strokeOpacity={0.25}
              strokeDasharray="4 3"
              label={<CrossoverLabel />}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {latest && latestFooter && (
        <p className="mt-3 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          Latest: {latest.month} {latest.year} · {latestFooter}
        </p>
      )}
    </BentoCard>
  );
});

function StackedTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: readonly { name?: string | number; value?: unknown; color?: string }[];
  label?: string | number;
  metric?: ChartMetric;
}) {
  if (!active || !payload?.length) return null;
  const isVol = metric !== "value";
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const p2mRaw = payload.find((p) => p.name === "P2M");
  const p2pRaw = payload.find((p) => p.name === "P2P");
  const p2m = p2mRaw ? { name: "P2M", value: num(p2mRaw.value), color: p2mRaw.color } : null;
  const p2p = p2pRaw ? { name: "P2P", value: num(p2pRaw.value), color: p2pRaw.color } : null;
  const total = (p2m?.value ?? 0) + (p2p?.value ?? 0);

  const fmt = (v: number) =>
    isVol ? `${v.toFixed(2)} Mn` : `₹${formatIndianNumber(Math.round(v))} Cr`;

  return (
    <div className="bg-card border border-foreground/10 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-mono text-[10px] text-muted-foreground mb-1.5">{label}</p>
      {[p2m, p2p].map((p) =>
        p ? (
          <div key={p.name} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-mono tabular-nums">
              {fmt(p.value)}
              <span className="text-muted-foreground ml-1">
                ({total > 0 ? ((p.value / total) * 100).toFixed(1) : 0}%)
              </span>
            </span>
          </div>
        ) : null,
      )}
      <div className="border-t border-foreground/10 mt-1.5 pt-1.5 flex justify-between font-mono">
        <span>Total</span>
        <span className="tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );
}

function CrossoverLabel({ viewBox }: { viewBox?: { x?: number; y?: number; height?: number } }) {
  if (!viewBox || viewBox.x === undefined) return null;
  return (
    <text
      x={(viewBox.x ?? 0) + 4}
      y={16}
      fill="var(--color-muted-foreground)"
      fontSize={9}
      fontFamily="var(--font-mono)"
      textAnchor="start"
    >
      P2M overtook P2P
    </text>
  );
}
