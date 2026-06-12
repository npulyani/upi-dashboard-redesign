import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { avgTicket } from "@/lib/upi/insights";
import { formatNumber } from "@/lib/upi/queries";
import { AppMonthData } from "@/lib/upi/types";
import { AXIS_TICK_SM, SERIES_COLORS, TOOLTIP_STYLE_SM } from "./constants";

export const TicketSizeCard = memo(function TicketSizeCard({
  selected,
  trendRows,
  current,
}: {
  selected: string[];
  trendRows: Record<string, number | string>[];
  current: AppMonthData[];
}) {
  // Ticket size trend (reuses trendRows which already has volume + value per app)
  const ticketRows = useMemo((): Record<string, number | string>[] => {
    return trendRows.map((row) => {
      const out: Record<string, number | string> = { label: row.label, year: row.year, month: row.month };
      for (const app of selected) {
        const vol = (row[app] as number) ?? 0;
        const val = (row[`${app}__value`] as number) ?? 0;
        out[`${app}__ticket`] = vol > 0 ? (val * 1e7) / (vol * 1e6) : 0;
      }
      return out;
    });
  }, [trendRows, selected]);

  // Current month ticket size per app (all apps, for ranked bar)
  const currentTickets = useMemo(() => {
    if (!current.length) return [];
    return [...current]
      .filter((r) => r.cit_volume_mn > 0)
      .map((r) => ({ app: r.app_name, ticket: avgTicket(r) }))
      .sort((a, b) => b.ticket - a.ticket)
      .slice(0, 15);
  }, [current]);

  return (
    <BentoCard className="col-span-12 min-h-[420px]" delay={320}>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
        <div>
          <CardLabel>Average ticket size · ₹ per transaction</CardLabel>
          <h3 className="font-serif text-2xl mt-1">Who's getting bigger transactions?</h3>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">24-month trend (selected apps)</p>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <LineChart data={ticketRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--color-muted-foreground)"
                  tick={AXIS_TICK_SM}
                  axisLine={false} tickLine={false}
                  interval={Math.max(0, Math.floor(ticketRows.length / 6))}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  tick={AXIS_TICK_SM}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${formatNumber(v as number, 0)}`}
                  width={48}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE_SM}
                  formatter={(v: number, name: string) => [`₹${Math.round(v).toLocaleString("en-IN")}`, name.replace("__ticket", "")]}
                />
                {selected.map((app, i) => (
                  <Line
                    key={app}
                    type="monotone"
                    dataKey={`${app}__ticket`}
                    name={`${app}__ticket`}
                    stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Current month · top 15 apps</p>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={currentTickets} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                  type="number"
                  tick={AXIS_TICK_SM}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${formatNumber(v as number, 0)}`}
                />
                <YAxis
                  dataKey="app"
                  type="category"
                  tick={AXIS_TICK_SM}
                  axisLine={false} tickLine={false}
                  width={72}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE_SM}
                  formatter={(v: number) => [`₹${Math.round(v).toLocaleString("en-IN")}`, "Avg ticket"]}
                />
                <Bar dataKey="ticket" fill="var(--color-chart-1)" fillOpacity={0.75} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </BentoCard>
  );
});
