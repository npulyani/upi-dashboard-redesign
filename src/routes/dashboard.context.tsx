import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { useDashboard } from "@/components/upi/DashboardContext";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { getP2PMData, P2PMPoint, formatIndianNumber } from "@/lib/upi/queries";
import { analytics } from "@/lib/analytics";

export const Route = createFileRoute("/dashboard/context")({
  head: () => ({
    meta: [
      { title: "Context — State of UPI" },
      {
        name: "description",
        content:
          "UPI P2P vs P2M split, merchant adoption trend, and ticket size divergence — Jan 2021 to present.",
      },
    ],
  }),
  component: ContextPage,
});

type ChartMetric = "volume" | "value";

function everyNthLabel(data: P2PMPoint[], n = 6) {
  return (value: string) => {
    const idx = data.findIndex((d) => d.label === value);
    return idx >= 0 && idx % n === 0 ? value : "";
  };
}

function ContextPage() {
  const { year, month } = useDashboard();
  const [data, setData] = useState<P2PMPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("volume");

  useEffect(() => {
    analytics.contextPageViewed();
    getP2PMData().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  const current = useMemo(
    () => data.find((d) => d.year === year && d.month === month) ?? data.at(-1) ?? null,
    [data, year, month],
  );

  const latest = data.at(-1);
  const baseline = data[0] ?? null;
  const tickFormatter = useMemo(() => everyNthLabel(data), [data]);

  if (loading) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!current || data.length === 0) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        No data
      </div>
    );
  }

  const p2mVolChange =
    baseline ? (current.p2m_volume_pct - baseline.p2m_volume_pct).toFixed(1) : null;

  const yAxisVolFmt = (v: number) => `${(v / 1000).toFixed(0)}K Mn`;
  const yAxisValFmt = (v: number) => `₹${(v / 100000).toFixed(1)}L Cr`;

  const latestFooter = latest
    ? chartMetric === "volume"
      ? `Total ${(latest.total_volume_mn / 1000).toFixed(1)}K Mn txns`
      : `Total ₹${(latest.total_value_cr / 100000).toFixed(1)}L Cr`
    : null;

  return (
    <div className="space-y-5">
      {/* ── Headline stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <BentoCard delay={0}>
          <CardLabel>P2M Volume Share · {current.month} {current.year}</CardLabel>
          <div className="mt-3 font-serif text-5xl">{current.p2m_volume_pct.toFixed(1)}%</div>
          <p className="mt-2 text-sm text-muted-foreground">
            of all UPI transactions are merchant payments
            {p2mVolChange && (
              <span className="ml-1 text-foreground font-medium">
                (+{p2mVolChange} pp since Jan '21)
              </span>
            )}
          </p>
        </BentoCard>

        <BentoCard delay={60}>
          <CardLabel>P2M Avg Ticket · {current.month} {current.year}</CardLabel>
          <div className="mt-3 font-serif text-5xl">₹{formatIndianNumber(Math.round(current.p2m_ticket))}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            avg merchant payment size
            {baseline && (
              <span className={`ml-1 font-medium ${current.p2m_ticket < baseline.p2m_ticket ? "text-emerald-600" : "text-foreground"}`}>
                ({current.p2m_ticket < baseline.p2m_ticket ? "↓" : "↑"}
                {Math.abs(((current.p2m_ticket - baseline.p2m_ticket) / baseline.p2m_ticket) * 100).toFixed(0)}% since Jan '21)
              </span>
            )}
          </p>
        </BentoCard>

        <BentoCard delay={120}>
          <CardLabel>P2P Avg Ticket · {current.month} {current.year}</CardLabel>
          <div className="mt-3 font-serif text-5xl">₹{formatIndianNumber(Math.round(current.p2p_ticket))}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            avg person-to-person transfer size
            {baseline && (
              <span className={`ml-1 font-medium ${current.p2p_ticket > baseline.p2p_ticket ? "text-foreground" : "text-muted-foreground"}`}>
                ({current.p2p_ticket > baseline.p2p_ticket ? "↑" : "↓"}
                {Math.abs(((current.p2p_ticket - baseline.p2p_ticket) / baseline.p2p_ticket) * 100).toFixed(0)}% since Jan '21)
              </span>
            )}
          </p>
        </BentoCard>
      </div>

      {/* ── P2P vs P2M stacked chart ─────────────────────────────────── */}
      <BentoCard delay={80}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <CardLabel>
              P2P vs P2M · {chartMetric === "volume" ? "Volume (Mn transactions)" : "Value (₹ Crore)"}
            </CardLabel>
            <h3 className="font-serif text-2xl mt-1">Merchant payments now dominate</h3>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {/* Local volume/value toggle */}
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
                <span className="size-2.5 rounded-sm inline-block" style={{ background: "var(--color-chart-1)" }} />
                P2M
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm inline-block" style={{ background: "var(--color-chart-2)" }} />
                P2P
              </span>
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="label"
              tickFormatter={tickFormatter}
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={chartMetric === "volume" ? yAxisVolFmt : yAxisValFmt}
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted-foreground)" }}
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

      {/* ── Merchant shift + ticket divergence ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* P2M share */}
        <BentoCard delay={100}>
          <CardLabel>P2M Share of UPI</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-6">The merchant shift</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tickFormatter={tickFormatter}
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
                width={36}
              />
              <Tooltip
                content={<ShareTooltip />}
                cursor={{ stroke: "var(--color-foreground)", strokeOpacity: 0.15, strokeWidth: 1 }}
              />
              <ReferenceLine y={50} stroke="var(--color-foreground)" strokeOpacity={0.2} strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="p2m_volume_pct"
                name="Volume %"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="p2m_value_pct"
                name="Value %"
                stroke="var(--color-chart-3)"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 flex items-center gap-5 text-xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 inline-block rounded" style={{ background: "var(--color-chart-1)" }} />
              Volume %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 inline-block rounded border-t-2 border-dashed" style={{ borderColor: "var(--color-chart-3)" }} />
              Value %
            </span>
            <span className="ml-auto text-[10px] uppercase tracking-wider">50% line = parity</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            P2M now drives <span className="text-foreground font-medium">{current.p2m_volume_pct.toFixed(0)}%</span> of transactions but only <span className="text-foreground font-medium">{current.p2m_value_pct.toFixed(0)}%</span> of value — UPI's volume growth is led by high-frequency, low-value merchant payments.
          </p>
        </BentoCard>

        {/* Ticket size divergence */}
        <BentoCard delay={140}>
          <CardLabel>Average Ticket Size (₹)</CardLabel>
          <h3 className="font-serif text-2xl mt-1 mb-6">P2P vs P2M ticket size</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tickFormatter={tickFormatter}
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}K`}
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                content={<TicketTooltip />}
                cursor={{ stroke: "var(--color-foreground)", strokeOpacity: 0.15, strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="p2p_ticket"
                name="P2P"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="p2m_ticket"
                name="P2M"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 flex items-center gap-5 text-xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 inline-block rounded" style={{ background: "var(--color-chart-2)" }} />
              P2P
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 inline-block rounded" style={{ background: "var(--color-chart-1)" }} />
              P2M
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            P2P transfers average <span className="text-foreground font-medium">₹{formatIndianNumber(Math.round(current.p2p_ticket))}</span> vs <span className="text-foreground font-medium">₹{formatIndianNumber(Math.round(current.p2m_ticket))}</span> for P2M — the <span className="text-foreground font-medium">{(current.p2p_ticket / current.p2m_ticket).toFixed(1)}×</span> gap reflects everyday merchant micro-payments fuelling UPI's transaction count.
          </p>
        </BentoCard>
      </div>

      {/* ── Methodology note ─────────────────────────────────────────── */}
      <div className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-widest leading-relaxed">
        Source: NPCI Ecosystem Statistics — P2P &amp; P2M Transactions tab · Jan 2021 – {latest?.month} {latest?.year} ·
        P2P = person-to-person transfers · P2M = person-to-merchant payments ·
        Avg ticket = value (₹ Cr) ÷ volume (Mn) × 10
      </div>
    </div>
  );
}

// ── Tooltip components ───────────────────────────────────────────────────────

function StackedTooltip({ active, payload, label, metric }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  metric?: ChartMetric;
}) {
  if (!active || !payload?.length) return null;
  const isVol = metric !== "value";
  const p2m = payload.find((p) => p.name === "P2M");
  const p2p = payload.find((p) => p.name === "P2P");
  const total = (p2m?.value ?? 0) + (p2p?.value ?? 0);

  const fmt = (v: number) =>
    isVol
      ? `${v.toFixed(2)} Mn`
      : `₹${formatIndianNumber(Math.round(v))} Cr`;

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
        ) : null
      )}
      <div className="border-t border-foreground/10 mt-1.5 pt-1.5 flex justify-between font-mono">
        <span>Total</span>
        <span className="tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );
}

function ShareTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-foreground/10 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-mono text-[10px] text-muted-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            P2M {p.name}
          </span>
          <span className="font-mono tabular-nums">{Number(p.value).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function TicketTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-foreground/10 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-mono text-[10px] text-muted-foreground mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-mono tabular-nums">₹{Math.round(p.value).toLocaleString("en-IN")}</span>
        </div>
      ))}
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
