# Feature Plan: App Page Enhancements

## Overview

Make the per-app deep-dive (`/dashboard/app/$appName`,
[`src/routes/dashboard.app.$appName.tsx`](../src/routes/dashboard.app.$appName.tsx))
richer and more engaging by adding **provider context** — who the app is — not just
how it performs.

Today the page is 100% transaction-derived: rank, volume/value, share, premium,
MoM/YoY/CAGR, all-time records, history chart, seasonality heatmap, rank neighbors,
and share trajectory. Every value comes from `upi_apps` (which stores only
`canonical_name` + `logo_domain`) joined to monthly data. There is no qualitative or
editorial information about the provider itself.

Features are grouped by how much new data each requires.

---

## Tier 1 — Uses data already in the repo (ship fastest)

### 1. "Key moments" timeline for this app
- `market-events.json` / `getMarketEvents()`
  ([`src/lib/upi/events.ts`](../src/lib/upi/events.ts)) already carries an
  `apps_affected: string[]` field that is currently **unused on this page**.
- Filter events to the current app and render a vertical timeline card
  (categories: regulatory / corporate / product / policy — color map already exists
  as `EVENT_CATEGORY_COLORS`).
- Use `eventDateDisplay()` for labels.
- New BentoCard, e.g. `col-span-12 lg:col-span-7`.

### 2. Event annotations on the history trajectory chart
- Overlay `ReferenceLine` / dots on the existing AreaChart (the "Full history"
  card) for events whose `apps_affected` includes this app.
- Match events to chart points via `eventMonthLabel()` (returns `"Jan '24"`, the
  same `label` the chart's X axis uses).
- Turns the plain area chart into a narrative — the policy/product change that
  moved the line becomes visible.

### 3. Geographic footprint
- Use statewise data + [`src/lib/upi/population.ts`](../src/lib/upi/population.ts).
- Show "where this provider is strongest": top states by this app's share.
- Note: statewise data is **not currently app-segmented** — confirm whether the
  source tables break volume down by app × state before committing. If not, this
  drops to Tier 3.

---

## Tier 2 — Needs a small metadata table (highest impact)

### 4. Provider profile card  ← the biggest gap
Mirror the existing `market_events` pattern: a DB table with a bundled JSON
fallback (see how `getMarketEvents()` reads `market_events` then falls back to
`market-events.json`). Migration is manual (per project convention).

Proposed `upi_app_profiles` (keyed by canonical app name):

| Field | Example (BHIM) |
|---|---|
| parent / owner | NPCI |
| type | Govt / TPAP / Bank app |
| launched | Dec 2016 |
| hq | Mumbai |
| sponsor (PSP) banks | — |
| play store rating + installs | 4.6 ★ · 100M+ |
| blurb (one line "what is it") | India's reference UPI app |

This is the literal answer to "more about the app rather than just UPI data."
Render as a profile BentoCard near the hero.

### 5. Feature support matrix
- Badges for UPI Lite, RuPay credit-on-UPI, UPI Autopay, international UPI,
  UPI Circle.
- Ties into the Tier 1 event timeline — those features launched on dates already
  tracked in `market-events.json`.
- Could live as a `features` column/array on the same `upi_app_profiles` row.

### 6. Head-to-head comparison
- Pick a rival, overlay the two trajectories on one chart.
- The existing `neighbors` block already identifies adjacent competitors — reuse
  it to seed the comparison picker.

---

## Tier 3 — Needs external data feeds

### 7. Reliability
- NPCI publishes per-app **technical decline rates**. A "reliability" stat would
  be genuinely novel vs. other UPI dashboards. Requires a new ingestion source.

### 8. Scale
- Registered users / MAU, funding & valuation (PhonePe, Paytm, etc.). Editorial /
  manually curated, refresh infrequently.

---

## Recommended sequencing

1. **Tier 1** (events timeline + chart annotations) — data already exists, fastest
   path to "engaging."
2. **Tier 2 provider profile card** — the real depth; populate real metadata for the
   top ~15 apps so the card ships non-empty.
3. Tier 2 feature matrix + comparison.
4. Tier 3 as data sources become available.

## Open questions
- Is statewise data app-segmented? (gates feature #3)
- Profile data source: hand-curated JSON to start, or scrape/import?
- DB table vs. JSON-only for `upi_app_profiles` — recommend mirroring
  `market_events` (table + JSON fallback) so it can be updated between deploys.
