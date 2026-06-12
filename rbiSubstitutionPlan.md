# Phase 2 — RBI Substitution Analysis

## Context

The UPI dashboard's Context page (`/dashboard/context`) tells the NPCI P2P/P2M story (shipped June 10, 2026). The remaining half of Phase 2 answers a bigger question: **"Is UPI growing the digital-payments pie, or eating it?"** To answer that, UPI volume/value must sit on the same chart as the other retail rails — debit-card POS, credit-card POS, IMPS, and ATM cash withdrawals — which only RBI publishes.

That RBI data is **not** available via a clean API. It ships as monthly **Payment System Indicators (PSI)** XLSX bulletins whose column layout drifts year to year and whose download URLs are unstable. So the data layer is the risky part; the UI reuses patterns already proven on the Context page.

**Decisions locked in for this pass:**
- **Sourcing:** manual download of RBI XLSX files into a local folder; the script parses them locally (no fragile auto-fetch).
- **Scope:** all 5 deliverables (headline stat, "pie" stacked area, debit-card-death indexed chart, Cash Multiple stat, Cash-is-sticky dual line).

**Reuse confirmed in codebase (verified June 10, 2026):**
- Ingestion pattern: `scripts/fetch_p2p_p2m.mjs` — `.env.local` parser, `createClient`, `.upsert(rows, { onConflict: "year,month_num" })`, `--dry-run` flag, `buildMonthList()` with `lastMonth = y === 2026 ? 5 : 12`.
- Query layer: `src/lib/upi/queries.ts` — `getP2PMData()` returns `[]` on missing table (graceful degradation), module-level `let p2pmCache` pattern, `import { supabase } from "../supabase"`.
- Route: `src/routes/dashboard.context.tsx` — `useEffect` data load into `useState`, `BentoCard` + `CardLabel` from `src/components/upi/BentoCard.tsx`, Recharts `ResponsiveContainer`/`LineChart`/`Line`/`ReferenceLine`, in-chart volume/value toggle via local state, layout = 3-col stat grid → full-width chart → 2-col grid.
- Migration convention: `supabase/migrations/add_p2p_p2m.sql` — `IF NOT EXISTS`, RLS enabled, `"public read"` policy, `UNIQUE (year, month_num)`.

---

## Step 1 — DB migration

**New file:** `supabase/migrations/add_rbi_payment_indicators.sql`

```sql
CREATE TABLE IF NOT EXISTS rbi_payment_indicators (
  id                bigserial   PRIMARY KEY,
  year              int         NOT NULL,
  month             text        NOT NULL,
  month_num         int         NOT NULL,
  debit_pos_vol_mn  numeric,
  debit_pos_val_cr  numeric,
  credit_pos_vol_mn numeric,
  credit_pos_val_cr numeric,
  imps_vol_mn       numeric,
  imps_val_cr       numeric,
  atm_vol_mn        numeric,
  atm_val_cr        numeric,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (year, month_num)
);
ALTER TABLE rbi_payment_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON rbi_payment_indicators FOR SELECT USING (true);
```

Value columns are nullable (early months may be missing a rail). **No `supabase` CLI on this machine** — the user applies this manually in the Supabase dashboard SQL editor before running the script.

---

## Step 2 — Source the data (manual download)

- Source: RBI **Payment System Indicators (PSI)** monthly bulletins, published ~4–6 weeks after month-end.
- User downloads the XLSX files into a new **`data/rbi/`** folder (gitignored or committed — confirm during execution; lean toward committing so the dataset is reproducible).
- **Coverage:** Jan 2021 → May 2026 (align with `upi_monthly_data` range).
- Fields to extract per month (volume Mn + value ₹ Cr): debit-card POS, credit-card POS, IMPS, ATM withdrawals.
- **Schema-drift risk:** before writing the parser, inspect 2–3 files across years (e.g. 2021, 2023, 2025). RBI splits the "Debit Cards" row differently some years and shifts columns (check F vs G). Map columns **by header text, not fixed index.**

---

## Step 3 — Ingestion script

**New file:** `scripts/fetch_rbi_indicators.mjs` — clone the skeleton of `scripts/fetch_p2p_p2m.mjs`.

- Reuse verbatim: `.env.local` parser, `createClient(SUPABASE_URL, SUPABASE_KEY, …)`, `MONTH_ABBR`, `buildMonthList()` (`lastMonth = y === 2026 ? 5 : 12`), `--dry-run` flag, `.upsert(rows, { onConflict: "year,month_num" })` on table `rbi_payment_indicators`.
- Replace the NPCI `fetch()` body with **local XLSX parsing**: read each file in `data/rbi/`, parse with the `xlsx` package, map header→field defensively.
- **Add dependency:** `npm i xlsx` (not currently in `package.json`). Import as `import * as XLSX from "xlsx"`.
- **Validation (always, even in dry-run):**
  - Cross-check that any UPI figure present in the RBI bulletin matches `upi_monthly_data` sums within 1–3%; flag >5% with ⚠ (mirrors the existing P2P/P2M cross-validation).
  - Sanity-flag null/zero rails and month gaps.
- Run `node scripts/fetch_rbi_indicators.mjs --dry-run` first to eyeball parsed rows, then without the flag to upsert.

---

## Step 4 — Query function

**Edit:** `src/lib/upi/queries.ts`

Add interface + cached getter, following the `getP2PMData()` shape exactly:

```typescript
export interface RBIIndicatorPoint {
  year: number; month: string; month_num: number; label: string;
  debit_pos_vol_mn: number; debit_pos_val_cr: number;
  credit_pos_vol_mn: number; credit_pos_val_cr: number;
  imps_vol_mn: number; imps_val_cr: number;
  atm_vol_mn: number; atm_val_cr: number;
}

let rbiCache: RBIIndicatorPoint[] | null = null;
export async function getRBIIndicators(): Promise<RBIIndicatorPoint[]> { … }
```

- Select ordered by `year`, then `month_num`; build `label` as `"Mon 'YY"` to match existing chart axes.
- **Graceful degradation:** on error / empty / unmigrated table, return `[]` — the Context page hides the whole RBI section when the array is empty (same as `getP2PMData()` returning `[]`).

---

## Step 5 — UI: 5 deliverables on `/dashboard/context`

**Edit:** `src/routes/dashboard.context.tsx`. Load via a second `useEffect` → `getRBIIndicators()` into `useState`; for the cash metrics also reuse the already-loaded `getP2PMData()` result. Render a new "Substitution" block **below** the existing P2P/P2M sections, only when `rbi.length > 0`. Reuse `BentoCard`, `CardLabel`, Recharts wrappers, and `--color-chart-1..5`.

**5a — UPI share of retail digital payments (headline stat card)**
- Formula: `UPI vol / (UPI + debit POS + credit POS + IMPS) × 100` (denominator excludes ATM — confirmed).
- Big % with a `Sparkline` (`src/components/upi/Sparkline.tsx`) of the trend.

**5b — "Eating the pie or growing it?" stacked area**
- Instruments: UPI + debit POS + credit POS + IMPS. Recharts stacked `Area`.
- In-chart toggle **% share ↔ absolute volume** (reuse the `chartMetric` useState toggle pattern already in this file).
- CardLabel: `Retail digital payments mix`.

**5c — "Debit card death chart"**
- UPI vs debit-POS **volume indexed to Jan 2021 = 100**, both lines same axis.
- `ReferenceLine` annotation at the crossover month: "UPI crossed debit POS in [month]" (compute crossover from data).
- CardLabel: `UPI vs debit card · indexed Jan 2021 = 100`.

**5d — "Cash Multiple" stat card**
- Formula: `UPI P2M value (rolling 12m) / ATM withdrawals value (rolling 12m)`, shown as e.g. `1.4×`.
- Needs both `getP2PMData()` (P2M value) and `getRBIIndicators()` (ATM value).

**5e — "Cash is sticky" dual-line chart**
- UPI P2M value vs ATM withdrawal value, both ₹ lakh cr, **rolling 12m**. Two `Line`s.
- CardLabel: `UPI P2M vs cash withdrawals · ₹ lakh cr (rolling 12m)`.

> Helpers (indexing to 100, rolling-12m sums, crossover detection) live inline in the route or in `src/lib/upi/insights.ts` if reused across cards.

---

## Step 6 — Monthly-update hook

After each NPCI monthly update (the 3 existing fetch scripts), the user also: downloads the new RBI bulletin into `data/rbi/` and runs `node scripts/fetch_rbi_indicators.mjs --dry-run` then live. Note: RBI lags NPCI by 4–6 weeks, so the newest UPI month may have no RBI row yet — the section should render only months where RBI data exists. (Update the `upi-dashboard-workflow` memory's monthly-update procedure once shipped.)

---

## Verification

1. **Migration:** confirm with user that `rbi_payment_indicators` exists in Supabase (`select count(*)` = 0 initially).
2. **Ingest dry-run:** `node scripts/fetch_rbi_indicators.mjs --dry-run` — inspect parsed rows for all 4 rails across a spread of years; confirm no ⚠ cross-validation flags >5%; confirm header-mapping handled schema drift.
3. **Ingest live:** run without `--dry-run`; spot-check a few months in Supabase against the source XLSX.
4. **Query:** temporarily log `getRBIIndicators()` length/first row, or assert via a quick node REPL.
5. **UI (preview tools):** `preview_start`; navigate to `/dashboard/context`; `preview_console_logs` clean; `preview_snapshot` shows the 5 new cards; toggle 5b's %↔absolute and confirm re-render; `preview_resize` for the 2-col→1-col responsive grid and `.dark` mode (add class via `preview_eval`); `preview_screenshot` for sign-off.
6. **Degradation:** confirm that with an empty/missing table the section is hidden and the rest of the page is unaffected.

## Notes / risks
- XLSX schema drift is the top risk — map by header, inspect multiple years first.
- ATM withdrawals in RBI PSI include on-us + off-us; that is the correct denominator for "cash is sticky."
- `xlsx` is a new dependency — adds to bundle only for the script (Node-side), not the client.
- ESLint enforces prettier but repo isn't prettier-clean at HEAD — format only the **new** files (script, migration); don't reformat `queries.ts`/`dashboard.context.tsx` beyond the added lines.
