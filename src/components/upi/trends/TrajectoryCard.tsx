import { memo, useMemo } from "react";
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
import { useMarketEvents } from "@/lib/upi/hooks";
import { formatIndianNumber, formatNumber } from "@/lib/upi/queries";
import {
  EVENT_CATEGORY_COLORS,
  eventDateDisplay,
  eventMonthLabel,
  MarketEvent,
} from "@/lib/upi/events";
import { AXIS_TICK, SERIES_COLORS, TOOLTIP_STYLE } from "./constants";

/** Hoverable dot rendered at the top of an event ReferenceLine (native SVG tooltip via <title>) */
function EventMarker({
  viewBox,
  events,
}: {
  viewBox?: { x?: number; y?: number };
  events?: MarketEvent[];
}) {
  if (!viewBox || viewBox.x === undefined || !events?.length) return null;
  return (
    <g transform={`translate(${viewBox.x}, ${(viewBox.y ?? 0) + 6})`} style={{ cursor: "help" }}>
      <title>{events.map((e) => `${eventDateDisplay(e)} — ${e.title}`).join("\n")}</title>
      <circle r={10} fill="transparent" />
      <circle
        r={4}
        fill={EVENT_CATEGORY_COLORS[events[0].category]}
        stroke="var(--color-card)"
        strokeWidth={1.5}
      />
    </g>
  );
}

export const TrajectoryCard = memo(function TrajectoryCard({
  selected,
  onChangeSelected,
  allApps,
  trendRows,
}: {
  selected: string[];
  onChangeSelected: (apps: string[]) => void;
  allApps: string[];
  trendRows: Record<string, number | string>[];
}) {
  const { metric } = useDashboardState();
  const events = useMarketEvents();

  // Events that fall inside the 24-month trajectory window, grouped by chart label
  const eventsInWindow = useMemo(() => {
    if (!trendRows.length || !events.length) return [];
    const labels = new Set(trendRows.map((r) => r.label as string));
    return events.filter((e) => labels.has(eventMonthLabel(e)));
  }, [trendRows, events]);

  const eventsByLabel = useMemo(() => {
    const m = new Map<string, MarketEvent[]>();
    for (const e of eventsInWindow) {
      const l = eventMonthLabel(e);
      if (!m.has(l)) m.set(l, []);
      m.get(l)!.push(e);
    }
    return m;
  }, [eventsInWindow]);

  return (
    <BentoCard className="col-span-12 min-h-[420px]" delay={280}>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
        <div>
          <CardLabel>24-month trajectory</CardLabel>
          <h3 className="font-serif text-2xl mt-1">
            {metric === "volume" ? "Transaction volume" : "Transaction value"} over time
          </h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {selected.map((app, i) => (
            <span
              key={app}
              className="flex items-center gap-1.5 text-xs bg-foreground/5 rounded-full pl-2 pr-1 py-1"
            >
              <span
                className="size-2 rounded-full"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              <span className="font-medium">{app}</span>
              <button
                onClick={() => onChangeSelected(selected.filter((a) => a !== app))}
                className="ml-0.5 text-muted-foreground hover:text-foreground rounded-full p-0.5 transition-colors"
                aria-label={`Remove ${app}`}
              >
                ×
              </button>
            </span>
          ))}
          {selected.length < 5 && (
            <select
              value=""
              onChange={(e) => {
                const app = e.target.value;
                if (app && !selected.includes(app)) {
                  onChangeSelected([...selected, app]);
                }
                e.target.value = "";
              }}
              className="h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              <option value="">+ Add app</option>
              {allApps
                .filter((a) => !selected.includes(a))
                .map((app) => (
                  <option key={app} value={app}>
                    {app}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>
      <div className="h-[340px] w-full">
        <ResponsiveContainer>
          <LineChart data={trendRows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--color-muted-foreground)"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              interval={Math.max(0, Math.floor(trendRows.length / 8))}
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatNumber(v as number)}
              width={50}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number, name) => [
                metric === "volume" ? `${(v as number).toFixed(1)}M` : `₹${formatIndianNumber(v as number)} Cr`,
                name,
              ]}
            />
            {Array.from(eventsByLabel.entries()).map(([label, evts]) => (
              <ReferenceLine
                key={label}
                x={label}
                stroke={EVENT_CATEGORY_COLORS[evts[0].category]}
                strokeDasharray="4 4"
                strokeOpacity={0.45}
                label={<EventMarker events={evts} />}
              />
            ))}
            {selected.map((app, i) => (
              <Line
                key={app}
                type="monotone"
                dataKey={metric === "volume" ? app : `${app}__value`}
                name={app}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {eventsInWindow.length > 0 && (
        <div className="mt-4 pt-4 border-t border-foreground/5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2.5">
            Market events in this window — hover the markers
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            {eventsInWindow.map((e) => (
              <li
                key={`${e.event_date}-${e.title}`}
                className="flex items-baseline gap-2.5 text-xs"
                title={`${e.description} (${e.source})`}
              >
                <span
                  className="size-2 rounded-full shrink-0 self-center"
                  style={{ background: EVENT_CATEGORY_COLORS[e.category] }}
                />
                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap tabular-nums">
                  {eventDateDisplay(e)}
                </span>
                <span className="font-medium leading-snug">{e.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </BentoCard>
  );
});
