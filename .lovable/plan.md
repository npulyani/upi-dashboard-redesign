## Plan — State of UPI redesign

Build a 3-page TanStack Start dashboard in the chosen **bento + minimalist whitespace + serif headings** direction, powered by the real NPCI dataset (62 monthly JSON files, Jan 2021 – Mar 2026) from your repo.

### 1. Data + foundations

- Copy `data/processed/*.json` (62 files) from your repo into `public/data/` so the client can fetch them directly. No backend needed.
- Add `src/lib/upi/types.ts` (ports your `UpiApp`, `AppMonthData`, `TableRow`, `MONTHS`).
- Add `src/lib/upi/queries.ts` with `getMonthData`, `getLatestMonth`, `getAvailableMonths`, `getUniqueApps`, `getPreviousMonth`, `getAppTrend` — fetch JSON from `/data/{year}-{month}.json`, cache results in-memory.
- Update `src/styles.css`: add `--font-serif` (Instrument Serif via Google Fonts) for headings, keep Inter for body, JetBrains Mono for numbers. Add brand tokens (primary indigo, soft surface, asymmetrical card radii).

### 2. Layout

- `src/routes/dashboard.tsx` — layout route: minimal serif wordmark "State of UPI", pill nav (Overview / Trends / Data), global month scrubber + Volume↔Value toggle in a slim sticky bar. Renders `<Outlet />`.
- Redirect `/` → `/dashboard` in `src/routes/index.tsx`.

### 3. Pages

**`/dashboard` (Overview)** — asymmetric 12-col bento:
- Big hero tile (col-span-8): total volume for current month in oversized serif, MoM %, area sparkline of last 12 months.
- Market leader tile (col-span-4): primary-color card, leader name in serif, share % bar vs runner-up.
- Top 10 app cards (4-up grid): rank, app name, headline metric, share bar.
- Mini trend strip: 3 default apps line chart (recharts).

**`/dashboard/trends`** — bento grid:
- Insight cards (3-up): MoM movers, fastest grower, biggest decliner — derived from data.
- Multi-line trend chart with app selector (up to 5).
- Market-share stacked horizontal bar (replacing donut) + 3-period comparison (now / -6m / -12m).

**`/dashboard/data`** — full table:
- Sortable columns: rank, app, volume (M), value (₹ Cr), share %, MoM %, 12-month sparkline.
- Search + Volume/Value toggle. Export CSV.

### 4. Components (`src/components/upi/`)
`MonthScrubber`, `MetricToggle`, `BentoCard`, `Sparkline`, `RankCard`, `MarketLeaderCard`, `TrendChart`, `MarketShareBar`, `DataTable`, `InsightCard`.

Charts: `recharts` (already in shadcn). Add `react-window` only if table perf needs it (skip initially).

### Design specifics carried verbatim from the picked direction
- Card radius `rounded-[24px]` / `rounded-[32px]`; ring `ring-1 ring-black/5`; surface `bg-white` on `bg-background` (`hsl(210 20% 98%)`).
- Primary `hsl(217 91% 60%)` for accent surfaces (leader tile, ticks, callouts).
- Numbers in JetBrains Mono; headings in Instrument Serif (the direction's Inter Extrabold gets swapped per your "serif headings" instruction); body in Inter.
- Subtle slide-up + numberReveal animations on mount.
- Asymmetric grid (8/4, 12, 4×3) — never a uniform 3-col wall.

### Out of scope (this pass)
- Auth, persistence, user prefs — none needed; data is static JSON.
- Mobile polish beyond responsive collapse to single column.
- Dark mode.

Ready to switch to build mode and ship.