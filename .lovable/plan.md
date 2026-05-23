# UPI Insights Portal — Iteration 2

Goal: take the current 3-tab dashboard (Overview / Trends / Data) and turn it into a comprehensive insights portal. Scope kept tight (one focused build pass) by picking the single highest-leverage piece from each of the four themes you selected, rather than building everything end-to-end.

## What we'll build

### 1. Per-app deep-dive page (`/dashboard/app/$appName`)
A dedicated route for any UPI app. Linked from every app name in the Data tab and Trends legend.

Contents (bento layout, matching existing design system):
- Hero: app name, current rank, current volume + value, MoM/YoY/3yr CAGR
- Full-history line chart (Jan 2021 → latest) with metric toggle
- All-time peak month + value, all-time low, longest streak at rank #1 (if any)
- Rank timeline (small chart showing rank over time, lower = better)
- Market-share trajectory area chart
- "Movers around this app" — the 2 apps directly above and below in current rank
- Download CSV of this app's full history

### 2. Rankings & Movers strip (on Trends tab)
A compact horizontal section above the existing insight cards:
- Top 3 rank climbers this month (with arrow + delta)
- Top 3 rank fallers
- Each is clickable → deep-dive page

### 3. Competitive landscape quadrant (new card on Trends tab)
Scatter plot replacing/complementing the "Trajectory check" card:
- X axis: market share (current month, log scale)
- Y axis: YoY growth %
- Bubble size: transaction value (Cr)
- Four quadrants labeled: Leaders, Challengers, Niche, Laggards
- Hover reveals app name + numbers; click → deep-dive

Plus one new stat card: **HHI concentration index** for the current month with MoM delta ("Market is more/less concentrated").

### 4. Storytelling layer (on Overview tab)
Auto-generated narrative paragraph above the existing cards:
> "In Mar 2026, the top 3 apps controlled 94.2% of transaction volume. PhonePe extended its lead with +3.1% MoM while Navi grew fastest among challengers at +18.4%. Total ecosystem processed 18.3B transactions worth ₹24.7L Cr — up 2.1% from last month."

Built from data already loaded — no new fetches. Template-driven, 2–3 sentences, regenerates per selected month.

### 5. Data tab upgrades
- Column sorting (rank, volume, value, MoM %, share)
- Search box to filter apps by name
- Each row's app name becomes a link to the deep-dive
- Inline 12-month sparkline column
- "Export visible rows to CSV" button
- New computed column: **Avg ticket size** (value × 1e7 ÷ volume × 1e6 = ₹ per txn)

## Technical notes

- New files:
  - `src/routes/dashboard.app.$appName.tsx` — deep-dive route
  - `src/lib/upi/insights.ts` — pure functions: `computeHHI`, `computeRankChanges`, `computeAvgTicket`, `computeCAGR`, `generateNarrative`, `findPeak`
  - `src/components/upi/Quadrant.tsx` — scatter chart wrapper (Recharts `ScatterChart`)
  - `src/components/upi/RankBadge.tsx` — reusable rank delta pill (↑3 / ↓2)
  - `src/components/upi/AppLink.tsx` — wraps app name as `<Link to="/dashboard/app/$appName">`
- Edits:
  - `src/routes/dashboard.trends.tsx` — add Movers strip, Quadrant card, HHI card; remove redundant cells
  - `src/routes/dashboard.index.tsx` — prepend narrative paragraph
  - `src/routes/dashboard.data.tsx` — sorting state, search input, sparkline col, avg ticket col, CSV export, AppLink wrap
- Data: all derived client-side from existing JSON files; no schema changes, no backend.
- URL state for deep-dive metric toggle uses TanStack Router `validateSearch` so links are shareable.
- All charts continue using Recharts (already in tree). Quadrant uses `ScatterChart` + `ZAxis` for bubble size.
- Routes added via file-based routing — `routeTree.gen.ts` regenerates automatically.

## Out of scope (saved for future iterations)
- Side-by-side compare page
- Forecast/projection tab
- Seasonality heatmap
- Annotated key events overlay on charts
- Monthly PDF digest
- Dark mode, mobile re-layout, loading skeletons
- Methodology page
- Anomaly detection (>2σ flags)

These are all worthwhile — they're listed so you can pick the next slice after this lands.
