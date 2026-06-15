import { memo, useMemo } from "react";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { MccRow, Metric } from "@/lib/upi/types";
import { mccTicket, pickMccMetric } from "@/lib/upi/mcc";
import { formatIndianNumber, formatNumber } from "@/lib/upi/queries";

function metricLine(r: MccRow, metric: Metric): string {
  return metric === "volume"
    ? `${formatNumber(r.volume_mn * 1e6, 1)} txns`
    : `₹${formatIndianNumber(r.value_cr)} Cr`;
}

/** W1 — three stat cards, each leading with the category name as the hero value. */
export const MccStatCards = memo(function MccStatCards({
  monthRows,
  metric,
}: {
  monthRows: MccRow[];
  metric: Metric;
}) {
  const { largest, biggest, smallest } = useMemo(() => {
    if (!monthRows.length) return { largest: null, biggest: null, smallest: null };
    const byMetric = [...monthRows].sort(
      (a, b) => pickMccMetric(b, metric) - pickMccMetric(a, metric),
    );
    const byTicket = [...monthRows]
      .filter((r) => r.volume_mn > 0)
      .sort((a, b) => mccTicket(b) - mccTicket(a));
    return {
      largest: byMetric[0] ?? null,
      biggest: byTicket[0] ?? null,
      smallest: byTicket[byTicket.length - 1] ?? null,
    };
  }, [monthRows, metric]);

  const cards = [
    {
      label: "Largest category",
      hero: largest?.description,
      sub: largest ? metricLine(largest, metric) : "—",
    },
    {
      label: "Biggest ticket",
      hero: biggest?.description,
      sub: biggest ? `₹${formatIndianNumber(mccTicket(biggest))} / txn` : "—",
    },
    {
      label: "Smallest ticket",
      hero: smallest?.description,
      sub: smallest ? `₹${formatIndianNumber(mccTicket(smallest))} / txn` : "—",
    },
  ];

  return (
    <>
      {cards.map((c, i) => (
        <BentoCard
          key={c.label}
          className="col-span-12 sm:col-span-6 lg:col-span-4"
          delay={60 + i * 40}
        >
          <CardLabel>{c.label}</CardLabel>
          <h3 className="font-serif text-2xl lg:text-3xl mt-1 leading-tight">{c.hero ?? "—"}</h3>
          <p className="font-mono text-sm text-muted-foreground mt-1">{c.sub}</p>
        </BentoCard>
      ))}
    </>
  );
});
