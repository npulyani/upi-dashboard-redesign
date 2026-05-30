# Feature Plan: UPI Transactions Per Capita

## Overview

Add population-normalized UPI metrics to the dashboard. "Transactions per person" reveals true digital adoption depth — large states dominate absolute volume but smaller, more connected states lead on penetration.

---

## Data Layer

### Population Lookup (`src/lib/upi/population.ts`)

Static map of NPCI state name → 2021 projected population (millions). Covers all 28 states + 8 UTs.
Units kept in millions to match `volume_in_mn`, so the ratio yields transactions/person directly.

```ts
export const STATE_POPULATION_MN: Record<string, number> = {
  "MAHARASHTRA": 126.4,
  "UTTAR PRADESH": 235.7,
  "DELHI": 32.9,
  "GOA": 1.6,
  // ... all 36 states/UTs
};

export function transactionsPerCapita(volume_in_mn: number, state: string): number | null
// Returns null for "Total", "Unclassified", or unknown state names
```

---

## Map View Feature

### Metric Toggle (existing map section on `dashboard.index.tsx`)

Add a segmented control alongside the existing Volume / Value toggle:

```
[ Volume ]  [ Value ]  [ Per Capita ]
```

When **Per Capita** is selected:
- Metric = `volume_in_mn / STATE_POPULATION_MN[state]` (txns/person/month)
- Annualized display = multiply by 12 for readability

### Color Gradient (`StateMap.tsx`)

- **Current mode (Volume/Value):** sequential blue scale (light → deep indigo), all relative to max
- **Per Capita mode:** two-tone diverging scale:
  - **Above national average** → green gradient (deeper = further above)
  - **Below national average** → muted grey/red gradient
  - **National average** computed as: `total_india_volume_mn / total_india_population_mn`
  - States above threshold get a subtle highlight ring or border accent on the map

### Tooltip (hover state)

In per-capita mode, tooltip shows:
```
MAHARASHTRA
Txns/person/month: 2.4
vs. India avg: +18%
Population: 126.4 mn
```

---

## Insights Box

A card placed below (or beside) the map, rendered when per-capita mode is active.

**Generates 5 plain-English insight sentences** from the current month's data:

| # | Insight | Example output |
|---|---------|----------------|
| 1 | Most penetrated state | "Telangana leads with 4.1 transactions per person per month — nearly 2× the national average." |
| 2 | Least penetrated state | "Uttar Pradesh has the lowest UPI penetration at 0.6 txns/person, representing a large untapped opportunity." |
| 3 | Above-average states count | "12 of 36 states are above the national average of 2.1 txns/person/month." |
| 4 | Punching above weight | "Delhi and Goa punch well above their population weight — both small in population but top-5 in per-capita adoption." |
| 5 | Growth gap | "Bihar and UP together account for 26% of India's population but only 9% of UPI volume — the biggest digital divide." |

Insights are computed client-side from live data, not hardcoded. Sentence templates interpolate real values.

---

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/upi/population.ts` | **Create** | Population lookup + `transactionsPerCapita()` helper |
| `src/lib/upi/types.ts` | **Modify** | Add `PerCapitaRow` derived type (state, volume_in_mn, txns_per_capita, vs_national_avg_pct) |
| `src/components/upi/StateMap.tsx` | **Modify** | Accept `metric` prop; per-capita color scale + diverging gradient; updated tooltip |
| `src/components/upi/PerCapitaInsights.tsx` | **Create** | Insight card component — takes statewise data, emits 5 insight strings |
| `src/routes/dashboard.index.tsx` | **Modify** | Wire up metric toggle state; pass to StateMap; render PerCapitaInsights below map |

---

## Insight Generation Logic (`PerCapitaInsights.tsx`)

```ts
function computeInsights(rows: StatewiseRow[]): string[] {
  const perCapitaRows = rows
    .filter(r => r.district === "" && transactionsPerCapita(r.volume_in_mn, r.state_union_territory) !== null)
    .map(r => ({ ...r, tpc: transactionsPerCapita(r.volume_in_mn, r.state_union_territory)! }))
    .sort((a, b) => b.tpc - a.tpc);

  const nationalAvg = totalIndiaTpc(rows);
  const aboveAvg = perCapitaRows.filter(r => r.tpc > nationalAvg);

  return [
    `${perCapitaRows[0].state} leads with ${fmt(perCapitaRows[0].tpc)} transactions per person/month — ${pctAbove(perCapitaRows[0].tpc, nationalAvg)}× the national average.`,
    `${perCapitaRows.at(-1).state} has the lowest UPI penetration at ${fmt(perCapitaRows.at(-1).tpc)} txns/person — significant headroom remains.`,
    `${aboveAvg.length} of ${perCapitaRows.length} states are above the national average of ${fmt(nationalAvg)} txns/person/month.`,
    // insight 4: largest gap between population rank and per-capita rank
    // insight 5: bottom 2 states by population share vs. volume share gap
  ];
}
```

---

## Open Questions / Future Extensions

- Annualized vs. monthly display preference (toggle or always annualized?)
- Should the insights box update dynamically as the user changes the selected month?
- District-level per-capita would need district population data (not currently available from any public source at sufficient granularity)
- Could add a scatter plot: population (x) vs. UPI volume (y) with states as dots — outliers above the line are over-performers

---

## Verification Checklist

- [ ] Maharashtra does NOT top per-capita list (it dominates absolute volume)
- [ ] Delhi, Goa, Telangana appear in top 5 per-capita
- [ ] "Unclassified" and "Total" rows excluded from per-capita calculations
- [ ] Color diverges clearly at national average (not at max/min)
- [ ] Insights card shows correct state names and real computed values
- [ ] Tooltip in per-capita mode shows vs. national avg %
- [ ] Build passes with no TypeScript errors
