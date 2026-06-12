import { memo, useMemo } from "react";
import { MapMetric, StatewiseRow } from "@/lib/upi/types";
import { calcPerCapita, calcSpendsPerCapita } from "@/lib/upi/population";

interface PerCapitaInsightsProps {
  stateData: StatewiseRow[];
  populations: Map<string, number>;
  mapMetric: MapMetric;
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export const PerCapitaInsights = memo(function PerCapitaInsights({ stateData, populations, mapMetric }: PerCapitaInsightsProps) {
  const isTxns = mapMetric === "txnsPerCapita";

  const insights = useMemo(() => {
    if (!stateData.length || !populations.size) return [];

    const rows = stateData.filter(
      (r) =>
        r.district === "" &&
        r.state_union_territory.trim() !== "" &&
        !r.state_union_territory.toLowerCase().includes("unclassified") &&
        !r.state_union_territory.toLowerCase().endsWith(" total"),
    );

    type EnrichedRow = { name: string; rawValue: number; pc: number; pop: number };

    const enriched: EnrichedRow[] = rows
      .map((r) => {
        const name = r.state_union_territory;
        const pc = isTxns
          ? calcPerCapita(r.volume_in_mn, name, populations)
          : calcSpendsPerCapita(r.value_in_cr, name, populations);
        const pop = populations.get(name.trim().toUpperCase()) ?? null;
        if (pc === null || pop === null) return null;
        return { name, rawValue: isTxns ? r.volume_in_mn : r.value_in_cr, pc, pop };
      })
      .filter((x): x is EnrichedRow => x !== null)
      .sort((a, b) => b.pc - a.pc);

    if (enriched.length < 3) return [];

    const totalRaw = enriched.reduce((a, r) => a + r.rawValue, 0);
    const totalPop = enriched.reduce((a, r) => a + r.pop, 0);
    // national avg: total_volume_mn / total_pop_mn  OR  total_value_cr * 10 / total_pop_mn
    const nationalAvg = totalPop > 0
      ? (isTxns ? totalRaw : totalRaw * 10) / totalPop
      : 0;
    const aboveAvg = enriched.filter((r) => r.pc > nationalAvg);

    const top = enriched[0];
    const bottom = enriched[enriched.length - 1];

    const byRaw = [...enriched].sort((a, b) => b.rawValue - a.rawValue);
    const rawRank = new Map(byRaw.map((r, i) => [r.name, i + 1]));
    const pcRank = new Map(enriched.map((r, i) => [r.name, i + 1]));

    let maxGap = { name: "", gap: 0 };
    for (const r of enriched) {
      const gap = (rawRank.get(r.name) ?? 0) - (pcRank.get(r.name) ?? 0);
      if (gap > maxGap.gap) maxGap = { name: r.name, gap };
    }

    const bigTwo = [...enriched].sort((a, b) => b.pop - a.pop).slice(0, 2);
    const bigTwoPopShare = ((bigTwo[0].pop + bigTwo[1].pop) / totalPop) * 100;
    const bigTwoRawShare = ((bigTwo[0].rawValue + bigTwo[1].rawValue) / totalRaw) * 100;

    const pcUnit = isTxns ? "txns/person/month" : "₹/person/month";
    const fmtPc = (v: number) => isTxns ? fmt(v) : `₹${fmt(v, 0)}`;
    const metricWord = isTxns ? "UPI volume" : "UPI value";

    const out: string[] = [];

    out.push(
      `${titleCase(top.name)} leads with ${fmtPc(top.pc)} ${pcUnit} — ${fmt(top.pc / nationalAvg, 1)}× the national average of ${fmtPc(nationalAvg)}.`,
    );

    out.push(
      `${titleCase(bottom.name)} has the lowest UPI adoption at ${fmtPc(bottom.pc)} ${pcUnit}, representing significant headroom for growth.`,
    );

    out.push(
      `${aboveAvg.length} of ${enriched.length} states are above the national average of ${fmtPc(nationalAvg)} ${pcUnit}.`,
    );

    if (maxGap.gap >= 3) {
      out.push(
        `${titleCase(maxGap.name)} punches well above its population weight — it ranks #${pcRank.get(maxGap.name)} in per-capita adoption but #${rawRank.get(maxGap.name)} by absolute ${metricWord}.`,
      );
    } else {
      const smallHighPerformer = enriched.slice(0, 5).sort((a, b) => a.pop - b.pop)[0];
      out.push(
        `${titleCase(smallHighPerformer.name)} (population ${fmt(smallHighPerformer.pop, 1)} mn) is a per-capita standout, ranking #${pcRank.get(smallHighPerformer.name)} despite its small size.`,
      );
    }

    out.push(
      `${titleCase(bigTwo[0].name)} and ${titleCase(bigTwo[1].name)} together account for ${fmt(bigTwoPopShare, 0)}% of India's population but only ${fmt(bigTwoRawShare, 0)}% of ${metricWord} — the largest digital divide by scale.`,
    );

    return out;
  }, [stateData, populations, isTxns, mapMetric]);

  if (!insights.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] p-4 space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Per-capita insights
      </p>
      <ul className="space-y-2">
        {insights.map((text, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="font-mono text-[10px] text-primary/50 mt-0.5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-sm leading-relaxed text-foreground/80">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
});
