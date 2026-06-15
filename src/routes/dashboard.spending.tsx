import { useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useDashboard } from "@/components/upi/DashboardContext";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { MccStatCards } from "@/components/upi/spending/MccStatCards";
import { MccRankedBar } from "@/components/upi/spending/MccRankedBar";
import { MccTicketScatter } from "@/components/upi/spending/MccTicketScatter";
import { MccTreemap } from "@/components/upi/spending/MccTreemap";
import { P2mStatCards } from "@/components/upi/spending/P2mStatCards";
import { P2pP2mTrendChart } from "@/components/upi/spending/P2pP2mTrendChart";
import { useMccData, useP2PM } from "@/lib/upi/hooks";
import { latestMccMonth, mccForMonth } from "@/lib/upi/mcc";
import { formatIndianNumber } from "@/lib/upi/queries";
import { analytics } from "@/lib/analytics";

export const Route = createFileRoute("/dashboard/spending")({
  head: () => ({
    meta: [
      { title: "Spending — State of UPI" },
      {
        name: "description",
        content:
          "How India spends on UPI: P2P vs P2M split, merchant category breakdown, ticket sizes, and spend mix.",
      },
    ],
  }),
  component: SpendingPage,
});

function SpendingPage() {
  const { year, month, metric } = useDashboard();
  const { mccRows, isPending } = useMccData();
  const { data: p2pm } = useP2PM();

  useEffect(() => {
    analytics.contextPageViewed();
  }, []);

  // The selected month may predate or lag the MCC coverage; fall back to the
  // latest month that actually has category data so the page is never empty.
  const { eff, monthRows } = useMemo(() => {
    const hasSelected = mccRows.some((r) => r.year === year && r.month === month);
    const eff = hasSelected ? { year, month } : latestMccMonth(mccRows);
    const monthRows = eff ? mccForMonth(mccRows, eff.year, eff.month, false) : [];
    return { eff, monthRows };
  }, [mccRows, year, month]);

  // P2P/P2M context for the second hero row, the summary, and the trend chart.
  const p2pmCurrent = useMemo(
    () => p2pm.find((d) => d.year === year && d.month === month) ?? p2pm.at(-1) ?? null,
    [p2pm, year, month],
  );
  const p2pmBaseline = p2pm[0] ?? null;

  if (!isPending && mccRows.length === 0) {
    return (
      <BentoCard className="col-span-12">
        <CardLabel>Spending</CardLabel>
        <h3 className="font-serif text-2xl mt-1">No merchant-category data yet</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Run the MCC ingestion scripts to populate <code>upi_mcc_data</code>.
        </p>
      </BentoCard>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-12">
        <CardLabel>Spending · merchant category classification</CardLabel>
        <h2 className="font-serif text-3xl lg:text-4xl mt-1">How India spends</h2>
        {eff && (
          <p className="text-sm text-muted-foreground mt-1">
            {eff.month} {eff.year}
            {eff.month !== month || eff.year !== year ? " · latest available category data" : ""}
          </p>
        )}
      </div>

      {/* Clubbed page summary (insights from the former Context charts) */}
      {p2pmCurrent && (
        <BentoCard className="col-span-12" tone="dark" delay={40}>
          <CardLabel className="text-background/60">The shape of UPI spend</CardLabel>
          <p className="font-serif text-xl lg:text-2xl mt-2 leading-snug text-background">
            P2M now drives {p2pmCurrent.p2m_volume_pct.toFixed(0)}% of transactions but only{" "}
            {p2pmCurrent.p2m_value_pct.toFixed(0)}% of value — UPI's growth is led by
            high-frequency, low-value merchant payments. P2P transfers average ₹
            {formatIndianNumber(Math.round(p2pmCurrent.p2p_ticket))} vs ₹
            {formatIndianNumber(Math.round(p2pmCurrent.p2m_ticket))} for P2M, a{" "}
            {(p2pmCurrent.p2p_ticket / p2pmCurrent.p2m_ticket).toFixed(1)}× gap that reflects
            everyday merchant micro-payments fuelling UPI's transaction count.
          </p>
        </BentoCard>
      )}

      {/* Hero row 1 — merchant categories */}
      <MccStatCards monthRows={monthRows} metric={metric} />

      {/* Hero row 2 — P2P/P2M */}
      {p2pmCurrent && <P2mStatCards current={p2pmCurrent} baseline={p2pmBaseline} />}

      {/* What India buys + two economies */}
      <MccRankedBar
        monthRows={monthRows}
        metric={metric}
        month={eff?.month ?? month}
        year={eff?.year ?? year}
      />
      <MccTicketScatter monthRows={monthRows} />

      {/* P2P vs P2M trend */}
      {p2pm.length > 0 && <P2pP2mTrendChart data={p2pm} />}

      {/* Category mix */}
      <MccTreemap monthRows={monthRows} metric={metric} />

      {/* Source note */}
      <p className="col-span-12 font-mono text-[10px] text-muted-foreground/70 uppercase tracking-widest leading-relaxed">
        Source: NPCI Ecosystem Statistics — Merchant Category (MCC) and P2P &amp; P2M tabs ·
        category visuals exclude the "Others" catch-all · avg ticket = value (₹ Cr) ÷ volume (Mn) ×
        10
      </p>
    </div>
  );
}
