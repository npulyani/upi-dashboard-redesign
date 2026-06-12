# UPI Dashboard — Performance & Scalability Audit + Remediation Plan

## Context

This session targets rendering efficiency and a performance/scalability refactor of the UPI analytics dashboard (React 19 + TanStack Start SSR on Cloudflare Workers, plus a parallel static SPA build for GitHub Pages, data from Supabase via anon key). A full system-design audit was performed across three layers: data flow, rendering, and build/infra. The findings below are verified against source (file:line), and the remediation is sequenced into four independently shippable phases.

---

## Part 1 — Audit Report

### 1.1 Data layer (most severe)

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| D1 | **65-request fan-out for history.** `getAllMonthsData()` calls `getMonthData()` once per month — one HTTP request each. Used by Overview (seasonality), Milestones, Year, and App detail (`dashboard.app.$appName.tsx:75-85` = 65 parallel requests on mount). | `src/lib/upi/queries.ts:216-230` | 🔴 Critical |
| D2 | **N+1 sparklines.** Data page fetches a per-app trend for top-12 apps; each trend internally fans out per month. | `src/routes/dashboard.data.tsx:66-73`, `queries.ts:85-108` | 🟠 High |
| D3 | **React Query installed but unused.** All routes do manual `useEffect`+`useState` fetching; caching is 6 ad-hoc module-level `Map`s with no TTL/invalidation, and SSR gets a fresh cache per request. `QueryClientProvider` is already wired in `__root.tsx` / `src/router.tsx`. | `queries.ts:19,145,177,214,232,271` | 🟠 High |
| D4 | **No DB indexes.** All tables have only PK/UNIQUE constraints; every query filters `.eq(year).eq(month)` (~15K-row `upi_monthly_data`, growing monthly) → full scans. | `supabase/migrations/*` | 🟠 High |
| D5 | Client-side filtering after over-fetch: trends fetch full per-month app lists then `.find()` per app. | `queries.ts:85-135` | 🟡 Medium |
| D6 | Dual source of truth for market events (bundled JSON fallback + Supabase table); ingestion is manual scripts with no schedule. | `src/lib/upi/events.ts`, `scripts/*.mjs` | 🟡 Medium |

### 1.2 Rendering layer

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| R1 | **Context value recreated every render**; `setMonthYear` is an inline closure, value not `useMemo`d → every `useDashboard()` consumer re-renders on any provider render. | `src/components/upi/DashboardContext.tsx:52-68` | 🔴 Critical |
| R2 | **Hidden StateMap still fetches 756KB.** Overview renders `<StateMap>` inside a `hidden` div; `react-simple-maps` still fetches `/india-states.json` (756KB) on every Overview load for an invisible component. | `dashboard.index.tsx:407-410`, `StateMap.tsx:167` | 🔴 Critical |
| R3 | **No `React.memo` on heavy/looped components**: `StateMap` (262 ln), `PerCapitaInsights`, `SeasonalityHeatmap`, `Sparkline` (rendered 12–50×). | `src/components/upi/*` | 🟠 High |
| R4 | **`buildSeasonalityMatrix` computed 3× independently** (Overview, Trends, App detail), each rebuilt on every metric toggle; `insights.ts` is 742 lines of derivations, all client-side. | `dashboard.index.tsx:87`, `dashboard.trends.tsx:200-209`, `dashboard.app.$appName.tsx:110` | 🟠 High |
| R5 | **`dashboard.trends.tsx` is an 874-line monolith** with 16 `useMemo`s; any context change re-evaluates the whole route. | `src/routes/dashboard.trends.tsx` | 🟠 High |
| R6 | Search on Data page is **disabled due to AppLogo perf** (up to 3 image-source fallbacks per row); comment: "Search temporarily disabled — see AppLogo perf fix in refactoring plan". | `dashboard.data.tsx:218` | 🟡 Medium |
| R7 | `generateNarrative` runs on every render (outside `useMemo`). | `dashboard.index.tsx:202` | 🟡 Medium |

### 1.3 Build / bundle / infra

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| B1 | **Single 1.2MB JS bundle** — no route code splitting; Recharts (~400KB) + 31 Radix packages + maps stack loaded for every page including the landing page. | `dist-static/assets/index-E8cgKVe5.js` | 🔴 Critical |
| B2 | SSR (Cloudflare Workers) exists but **all data fetching is client-side** — no route loaders, no edge caching, no Cache-Control strategy. | `vite.config.ts`, `src/server.ts` | 🟠 High |
| B3 | No bundle analyzer, no perf budgets, no Lighthouse CI. | — | 🟡 Medium |
| B4 | `public/data/` holds 65 per-month JSON snapshots written by ingestion scripts but consumed by nothing — a ready-made vehicle for a static history snapshot. | `public/data/` | ℹ️ Opportunity |

### 1.4 What is already good
No heavy deps (date-fns not moment, no lodash); PostHog lazy-initialized with web vitals on; `useDeferredValue` on search; effect-cancellation patterns; per-month dedup logic is correct; RLS public-read is intentional for this public dashboard.

---

## Part 2 — Remediation Plan

### Key design decisions

| Area | Decision | Rationale |
|---|---|---|
| Data fetching | One paginated range query for full `upi_monthly_data` history (pages of 1000 via `.range()`, ~8-9 requests) + small per-entity queries; trends/sparklines derive in-memory | Same bytes as today's 65 requests but ~8× fewer round trips; ~8K rows is trivial to hold in memory, grows ~125 rows/month |
| Caching | TanStack Query `queryOptions` factories; delete all module Maps | Provider already wired; TTL, dedupe, SSR-safe per-request isolation for free |
| Loader integration | Non-awaited `queryClient.prefetchQuery` in route loaders + `defaultPreload: 'intent'` | Identical behavior in SSR and static builds; never blocks navigation |
| Context | `useMemo` value + split into state/actions contexts, compat `useDashboard()` hook | Stable actions context means controls never re-render on month scrub; call sites unchanged |
| Code splitting | `autoCodeSplitting` via Start plugin (SSR) + `tanStackRouterCodeSplitter` from `@tanstack/router-plugin/vite` (static) | Verified: the splitter is exported separately from the generator, so `routeTree.gen.ts` is never rewritten (the documented reason the plugin was omitted from the static config) |

### Phase 1 — Quick wins (~1 day, no behavior change)

1. **Remove hidden StateMap fetch** — delete the `hidden` div at `dashboard.index.tsx:407-410` (or lazy-render behind a real toggle). Saves 756KB per Overview load.
2. **Memoize DashboardContext** (`DashboardContext.tsx:52-68`): `useCallback` for `setMonthYear`, `useMemo` the value; then split into `DashboardStateCtx` / `DashboardActionsCtx` with `useDashboard()` kept as compat hook.
3. **`React.memo`**: `Sparkline`, `AppLogo`, `SeasonalityHeatmap`, `PerCapitaInsights`, `StateMap`. Skip `BentoCard` (takes `children`; memo can't bail out).
4. **Re-enable Data-page search** (`dashboard.data.tsx:218-228`) — safe once AppLogo is memoized (module-level `srcIdxCache` already exists in `AppLogo.tsx:9`).
5. **New migration `supabase/migrations/add_performance_indexes.sql`** (applied manually, matching existing style):
   - `idx_monthly_year_month` on `upi_monthly_data (year, month_num, month) WHERE cit_volume_mn > 0`
   - `idx_statewise_year_month` on `upi_statewise_data (year, month, volume_in_mn DESC)`
   - `idx_statewise_state_trend` on `upi_statewise_data (state_union_territory, year, month_num) WHERE district = ''`
   - (`upi_p2p_p2m` already covered by its UNIQUE constraint.)
6. Wrap `generateNarrative` call (`dashboard.index.tsx:202`) in `useMemo`.

### Phase 2 — Data layer: React Query + range fetch (~2-3 days)

1. **New `src/lib/upi/queryOptions.ts`** — `queryOptions()` factories, keys rooted at `'upi'`:
   - `allMonthsQuery()` → `['upi','months','all']`: full-history fetch ordered by `(year, month_num)` with `.range()` pagination (PostgREST caps at 1000 rows); fetch `upi_apps` once as `['upi','apps']` and join client-side instead of embedding `upi_apps(...)` per row (~30% payload cut); reuse dedup logic from `queries.ts:50-63`; `staleTime: 1h`, `gcTime: 24h`.
   - `monthDataQuery(year, monthNum)`, `statewiseQuery(year, monthNum)`, `statewiseTrendQuery(state)`, `p2pmQuery()`, `statesQuery()`, `populationsQuery()`, `eventsQuery()`.
2. **New `src/lib/upi/hooks.ts`** — derivation hooks over `useQuery(allMonthsQuery())` + `select`: `useAllMonths`, `useMonthData`, `useAppTrend`, `useMultiAppTrend`, `useSparklines`, `useSeasonalityMatrix(metric, app?)`, `useMarketStructure(metric)`. `getAppTrend`/`getMultiAppTrend` become pure functions over the in-memory array — **the Data-page N+1 disappears entirely**.
3. **Migrate all 7 dashboard routes** off `useEffect`+`useState`; delete the 6 module caches from `queries.ts`.
4. **Loader warming**: non-awaited `queryClient.prefetchQuery(allMonthsQuery())` in dashboard route loaders; `defaultPreload: 'intent'` in `src/router.tsx`; QueryClient defaults `staleTime: 5m, retry: 1, refetchOnWindowFocus: false`. Context `year/month/metric` stay out of query keys (they're `select` inputs, not fetch inputs).

### Phase 3 — Rendering refactor (~1-2 days)

1. **Decompose `dashboard.trends.tsx`** into memoized section components under `src/components/upi/trends/` (`MarketShareChart`, `PremiumnessChart`, `TicketSizeChart`, `StateTrendExplorer`, `SeasonalitySection`), each consuming Phase-2 hooks so a metric toggle re-renders only affected sections.
2. **Single seasonality computation** — Overview, Trends, App detail all consume `useSeasonalityMatrix` (shared via React Query cache) instead of 3 independent rebuilds.
3. Stabilize chart props: hoist static `tick`/format objects and tooltip components to module scope (pattern already used in `dashboard.context.tsx`).

### Phase 4 — Bundle & code splitting (~1 day)

1. **SSR build** (`vite.config.ts`): `tanstackStart: { router: { autoCodeSplitting: true } }` (the Lovable wrapper forwards options to `tanstackStart()` — verified in its type defs).
2. **Static build** (`vite.config.static.ts`): add `tanStackRouterCodeSplitter({ autoCodeSplitting: true })` before `react()`.
3. **manualChunks** in both configs: `{ recharts: ['recharts'], maps: ['react-simple-maps','topojson-client'], supabase: ['@supabase/supabase-js'] }`.
4. Add `rollup-plugin-visualizer` (dev dep) behind `process.env.ANALYZE` + `"analyze"` npm script. Confirm landing page chunk is Recharts-free.

### Phase 5 — Backlog (not in scope now)

- Static history snapshot: emit `public/data/all-months.json` from ingestion script; `allMonthsQuery` fetches it from CDN and tops up newer months from Supabase (→ 1-2 cold requests).
- Full SSR data dehydration (`@tanstack/react-router-ssr-query`) + `Cache-Control: s-maxage=3600` on the Cloudflare worker.
- Consolidate market-events to Supabase-only source.

---

## Expected impact

| Phase | Effort | Impact |
|---|---|---|
| 1 | ~1d | −756KB Overview payload; no-op re-renders gone; search restored; DB indexed |
| 2 | 2-3d | Cold load ~70 → ~10 Supabase requests; instant tab navigation; 6 ad-hoc caches deleted |
| 3 | 1-2d | Sub-50ms metric/month toggles; 1 seasonality computation instead of 3 |
| 4 | ~1d | Initial JS 1.2MB → ~300-350KB in both builds; analyzer visibility |

## Verification (per phase, via preview tools / dev server)

- **P1**: Overview network tab shows no `/india-states.json` request; React DevTools Profiler — month scrub doesn't re-render `MonthScrubber`/`MetricToggle`; `EXPLAIN ANALYZE` shows index scans in Supabase SQL editor.
- **P2**: cold-load `/dashboard` → count `*.supabase.co` requests (expect ~10-12, was ~70); navigating Overview→Trends→Year→App fires zero new monthly-data requests; assert pagination loop covers all `AVAILABLE_MONTHS`.
- **P3**: Profiler — metric toggle on Trends commits <50ms and only chart sections re-render.
- **P4**: `npm run build && npm run build:static` both pass; `dist-static/assets/` has per-route chunks, entry <~350KB; click through all tabs + deep-link `/dashboard/trends` under the GH Pages base path; `wrangler dev` renders all routes.

## Critical files

- `src/lib/upi/queries.ts` → becomes `queryOptions.ts` + pure derivations (all caches removed)
- `src/components/upi/DashboardContext.tsx` → memoized/split context
- `src/routes/dashboard.trends.tsx` → decomposition target (874 ln)
- `src/routes/dashboard.index.tsx` → hidden StateMap removal, narrative memo
- `vite.config.ts` / `vite.config.static.ts` → code splitting, manualChunks, visualizer
- `supabase/migrations/add_performance_indexes.sql` → new (Phase 1)
