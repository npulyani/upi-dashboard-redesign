import { memo, useMemo } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { MccRow, Metric } from "@/lib/upi/types";
import { pickMccMetric, tierColor, MCC_TIERS } from "@/lib/upi/mcc";
import { formatIndianNumber } from "@/lib/upi/queries";
import { TOOLTIP_STYLE_SM } from "@/components/upi/trends/constants";

type Node = { name: string; size: number; fill: string; display: string };

function CellContent(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  fill?: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", fill } = props;
  const showLabel = width > 56 && height > 24;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        fillOpacity={0.85}
        stroke="var(--color-card)"
        strokeWidth={2}
      />
      {showLabel && (
        <text
          x={x + 6}
          y={y + 16}
          fontSize={10}
          fill="var(--color-card)"
          fontFamily="var(--font-sans)"
        >
          {name.length > Math.floor(width / 6) ? `${name.slice(0, Math.floor(width / 6))}…` : name}
        </text>
      )}
    </g>
  );
}

function TreemapTooltip({ active, payload }: { active?: boolean; payload?: { payload: Node }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE_SM} className="px-3 py-2">
      <p className="font-medium">{p.name}</p>
      <p className="text-muted-foreground">{p.display}</p>
    </div>
  );
}

/** W2 — category treemap, boxes sized by the chosen metric and colored by tier. */
export const MccTreemap = memo(function MccTreemap({
  monthRows,
  metric,
}: {
  monthRows: MccRow[];
  metric: Metric;
}) {
  const data = useMemo<Node[]>(() => {
    return [...monthRows]
      .map((r) => {
        const v = pickMccMetric(r, metric);
        const display =
          metric === "volume"
            ? `${formatIndianNumber(r.volume_mn)} Mn txns`
            : `₹${formatIndianNumber(r.value_cr)} Cr`;
        return { name: r.description, size: v, fill: tierColor(r.type), display };
      })
      .filter((d) => d.size > 0)
      .sort((a, b) => b.size - a.size);
  }, [monthRows, metric]);

  return (
    <BentoCard className="col-span-12 min-h-[420px]" delay={280}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <CardLabel>Category mix · sized by {metric}</CardLabel>
          <h3 className="font-serif text-2xl mt-1">The shape of UPI merchant spend</h3>
        </div>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          {MCC_TIERS.map((t) => (
            <span key={t.type} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <div className="h-[340px]">
        <ResponsiveContainer>
          <Treemap
            data={data}
            dataKey="size"
            stroke="var(--color-card)"
            content={<CellContent />}
            isAnimationActive={false}
          >
            <Tooltip content={<TreemapTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </BentoCard>
  );
});
