import { memo, useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { MccRow } from "@/lib/upi/types";
import { mccTicket } from "@/lib/upi/mcc";
import { formatIndianNumber, formatNumber } from "@/lib/upi/queries";
import { AXIS_TICK_SM, TOOLTIP_STYLE_SM } from "@/components/upi/trends/constants";

const TICKET_SPLIT = 1000; // ₹ — separates everyday spend from big-ticket transfers

type Point = { x: number; y: number; z: number; name: string };

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE_SM} className="px-3 py-2">
      <p className="font-medium mb-1">{p.name}</p>
      <p className="text-muted-foreground">{formatIndianNumber(p.x)} Mn txns</p>
      <p className="text-muted-foreground">₹{formatIndianNumber(p.y)} / txn</p>
      <p className="text-muted-foreground">₹{formatIndianNumber(p.z)} Cr total</p>
    </div>
  );
}

/** W4 — volume × ticket-size bubble map; bubble area encodes total value moved. */
export const MccTicketScatter = memo(function MccTicketScatter({
  monthRows,
}: {
  monthRows: MccRow[];
}) {
  const { everyday, bigTicket } = useMemo(() => {
    const pts: (Point & { big: boolean })[] = monthRows
      .filter((r) => r.volume_mn > 0 && r.value_cr > 0)
      .map((r) => {
        const ticket = mccTicket(r);
        return {
          x: r.volume_mn,
          y: ticket,
          z: r.value_cr,
          name: r.description,
          big: ticket >= TICKET_SPLIT,
        };
      });
    return {
      everyday: pts.filter((p) => !p.big),
      bigTicket: pts.filter((p) => p.big),
    };
  }, [monthRows]);

  return (
    <BentoCard className="col-span-12 lg:col-span-5 min-h-[520px]" delay={240}>
      <div className="mb-4">
        <CardLabel>Two economies · volume × ticket size</CardLabel>
        <h3 className="font-serif text-2xl mt-1">Everyday taps vs big-ticket transfers</h3>
      </div>
      <div className="flex gap-4 text-[11px] text-muted-foreground mb-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: "var(--color-chart-3)" }} />
          Everyday (&lt; ₹1,000)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: "var(--color-chart-2)" }} />
          Big-ticket (≥ ₹1,000)
        </span>
      </div>
      <div className="h-[420px]">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
            <CartesianGrid strokeOpacity={0.15} />
            <XAxis
              type="number"
              dataKey="x"
              name="Volume"
              scale="log"
              domain={["auto", "auto"]}
              tick={AXIS_TICK_SM}
              tickLine={false}
              tickFormatter={(v) => formatNumber(v, 0)}
              label={{
                value: "Monthly volume (Mn txns) →",
                position: "bottom",
                offset: 8,
                fontSize: 10,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Ticket"
              scale="log"
              domain={["auto", "auto"]}
              tick={AXIS_TICK_SM}
              tickLine={false}
              tickFormatter={(v) => `₹${formatNumber(v, 0)}`}
              width={48}
            />
            <ZAxis type="number" dataKey="z" range={[40, 900]} name="Value" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTooltip />} />
            <Scatter data={everyday} fill="var(--color-chart-3)" fillOpacity={0.55} />
            <Scatter data={bigTicket} fill="var(--color-chart-2)" fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </BentoCard>
  );
});
