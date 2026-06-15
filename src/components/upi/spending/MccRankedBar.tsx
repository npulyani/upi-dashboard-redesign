import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell as ChartCell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { MccRow, Metric } from "@/lib/upi/types";
import { mccTicket, pickMccMetric, tierColor, tierLabel, MCC_TIERS } from "@/lib/upi/mcc";
import { formatIndianNumber, formatNumber } from "@/lib/upi/queries";
import { AXIS_TICK_SM, TOOLTIP_STYLE_SM } from "@/components/upi/trends/constants";

/** W3 — top categories ranked by the chosen metric, bars colored by transacting tier. */
export const MccRankedBar = memo(function MccRankedBar({
  monthRows,
  metric,
  month,
  year,
}: {
  monthRows: MccRow[];
  metric: Metric;
  month: string;
  year: number;
}) {
  const data = useMemo(
    () =>
      [...monthRows]
        .sort((a, b) => pickMccMetric(b, metric) - pickMccMetric(a, metric))
        .slice(0, 15)
        .map((r) => ({
          description: r.description,
          value: pickMccMetric(r, metric),
          ticket: mccTicket(r),
          color: tierColor(r.type),
        })),
    [monthRows, metric],
  );

  const unit = metric === "volume" ? "Mn txns" : "₹ Cr";

  return (
    <BentoCard className="col-span-12 lg:col-span-7 min-h-[520px]" delay={200}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <CardLabel>What India buys · top 15 by {metric}</CardLabel>
          <h3 className="font-serif text-2xl mt-1">Where the money goes</h3>
        </div>
        <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
          {MCC_TIERS.map((t) => (
            <span key={t.type} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <div className="h-[440px]">
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={AXIS_TICK_SM}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatNumber(v, 0)}
            />
            <YAxis
              dataKey="description"
              type="category"
              tick={AXIS_TICK_SM}
              axisLine={false}
              tickLine={false}
              width={150}
              interval={0}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE_SM}
              formatter={(v: number, _n, p) => [
                `${formatIndianNumber(v)} ${unit} · ₹${formatIndianNumber((p?.payload as { ticket: number }).ticket)}/txn`,
                "Spend",
              ]}
              labelFormatter={(l) => `${l} — ${month} ${year}`}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} fillOpacity={0.85}>
              {data.map((d) => (
                <ChartCell key={d.description} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </BentoCard>
  );
});
