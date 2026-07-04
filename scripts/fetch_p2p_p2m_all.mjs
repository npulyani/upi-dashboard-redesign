/**
 * Bulk backfill: fetches UPI P2P/P2M split statistics from NPCI for all
 * months Jan 2021 → May 2026 and upserts into upi_p2p_p2m. For a single
 * month, use fetch_p2p_p2m.mjs instead.
 *
 * Validations performed:
 *   1. Internal: p2p_volume + p2m_volume ≈ total_volume (and same for value)
 *   2. External: total_volume from this API vs sum of cit_volume_mn in upi_monthly_data
 *
 * Usage:
 *   node scripts/fetch_p2p_p2m_all.mjs [--dry-run]
 *
 * Reads credentials from .env.local. Run add_p2p_p2m.sql migration first.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // fall through to process.env
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  env.VITE_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Month list — must match generateAvailableMonths() in queries.ts
// ---------------------------------------------------------------------------
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function buildMonthList() {
  const out = [];
  for (let y = 2021; y <= 2026; y++) {
    const lastMonth = y === 2026 ? 5 : 12;
    for (let m = 1; m <= lastMonth; m++) {
      out.push({ year: y, month: MONTH_ABBR[m - 1], month_num: m });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// NPCI fetch
// ---------------------------------------------------------------------------
const BASE_URL = "https://www.npci.org.in/api/ecosystem-statistics/get-statistics";

function parseNum(s) {
  if (s == null || s === "") return null;
  return parseFloat(String(s).replace(/,/g, ""));
}

async function fetchMonth(year, month) {
  const url =
    `${BASE_URL}?product_name=UPI&tab_name=p2p-and-p2m-transactions` +
    `&year=${year}&month=${month}&page_no=1&sort_by=asc&size=10&locale=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${month} ${year}`);
  const json = await res.json();
  const results = json?.data?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  return results[0];
}

// ---------------------------------------------------------------------------
// Load existing upi_monthly_data totals for cross-reference
// ---------------------------------------------------------------------------
async function loadExistingTotals() {
  // Fetch in pages to avoid the default 1000-row Supabase limit
  let allData = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("upi_monthly_data")
      .select("year, month_num, cit_volume_mn, cit_value_cr")
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("  Could not load upi_monthly_data for cross-reference:", error?.message);
      return new Map();
    }
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const data = allData;

  const totals = new Map();
  for (const r of data) {
    const key = `${r.year}-${r.month_num}`;
    const existing = totals.get(key) ?? { vol: 0, val: 0 };
    existing.vol += Number(r.cit_volume_mn);
    existing.val += Number(r.cit_value_cr);
    totals.set(key, existing);
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const months = buildMonthList();
const rows = [];
const warnings = [];
let fetchErrors = 0;

console.log(`Fetching ${months.length} months (${months[0].month} ${months[0].year} → ${months.at(-1).month} ${months.at(-1).year})\n`);

for (const { year, month, month_num } of months) {
  process.stdout.write(`  ${month} ${year} … `);

  let raw;
  try {
    raw = await fetchMonth(year, month);
  } catch (err) {
    console.error(`FETCH ERROR: ${err.message}`);
    fetchErrors++;
    continue;
  }

  if (!raw) {
    console.warn("no data");
    warnings.push(`${month} ${year}: API returned no results`);
    continue;
  }

  const totalVol = parseNum(raw.total_volume_mn);
  const totalVal = parseNum(raw.total_value_cr);
  const p2pVol   = parseNum(raw.p_2_p_volume_mn);
  const p2pVal   = parseNum(raw.p_2_p_value_cr);
  const p2mVol   = parseNum(raw.p_2_m_volume_mn);
  const p2mVal   = parseNum(raw.p_2_m_value_cr);

  if (totalVol == null || p2pVol == null || p2mVol == null) {
    console.warn("missing numeric fields");
    warnings.push(`${month} ${year}: missing numeric fields in API response`);
    continue;
  }

  // Internal validation: p2p + p2m should equal total (allow 0.1% tolerance)
  const volDiff = Math.abs((p2pVol + p2mVol) - totalVol);
  const valDiff = Math.abs((p2pVal + p2mVal) - totalVal);
  const volTol  = totalVol * 0.001;
  const valTol  = totalVal * 0.001;

  if (volDiff > volTol || valDiff > valTol) {
    warnings.push(
      `${month} ${year}: INTERNAL MISMATCH — ` +
      `vol p2p+p2m=${(p2pVol+p2mVol).toFixed(2)} vs total=${totalVol.toFixed(2)}, ` +
      `val p2p+p2m=${(p2pVal+p2mVal).toFixed(2)} vs total=${totalVal.toFixed(2)}`
    );
  }

  rows.push({ year, month, month_num, total_volume_mn: totalVol, total_value_cr: totalVal,
              p2p_volume_mn: p2pVol, p2p_value_cr: p2pVal, p2m_volume_mn: p2mVol, p2m_value_cr: p2mVal });

  console.log(`vol ${totalVol.toFixed(2)} mn  |  p2p ${((p2pVol/totalVol)*100).toFixed(1)}%  p2m ${((p2mVol/totalVol)*100).toFixed(1)}%`);

  await new Promise((r) => setTimeout(r, 150));
}

// ---------------------------------------------------------------------------
// Cross-reference against upi_monthly_data
// ---------------------------------------------------------------------------
console.log("\nLoading upi_monthly_data totals for cross-reference…");
const existingTotals = await loadExistingTotals();

console.log("\n── Cross-reference: NPCI P2P/P2M total vs upi_monthly_data sum ──────────────");
console.log("Month       API total vol   DB total vol   Diff %    API total val   DB total val   Diff %");
console.log("─".repeat(95));

let crossWarnings = 0;
for (const r of rows) {
  const key = `${r.year}-${r.month_num}`;
  const db = existingTotals.get(key);
  if (!db) {
    console.log(`${r.month} ${r.year}    ${r.total_volume_mn.toFixed(2).padStart(12)}   (no DB data)`);
    continue;
  }

  const volPct = db.vol > 0 ? ((r.total_volume_mn - db.vol) / db.vol) * 100 : null;
  const valPct = db.val > 0 ? ((r.total_value_cr - db.val) / db.val) * 100 : null;
  const flag = (Math.abs(volPct ?? 0) > 5 || Math.abs(valPct ?? 0) > 5) ? " ⚠" : "";

  if (flag) crossWarnings++;

  console.log(
    `${(r.month + " " + r.year).padEnd(10)}` +
    `  ${r.total_volume_mn.toFixed(2).padStart(14)}` +
    `  ${db.vol.toFixed(2).padStart(13)}` +
    `  ${volPct != null ? (volPct >= 0 ? "+" : "") + volPct.toFixed(2) + "%" : "n/a".padStart(7)}` +
    `  ${r.total_value_cr.toFixed(2).padStart(14)}` +
    `  ${db.val.toFixed(2).padStart(13)}` +
    `  ${valPct != null ? (valPct >= 0 ? "+" : "") + valPct.toFixed(2) + "%" : "n/a".padStart(7)}` +
    flag
  );
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------
console.log(`\n────────────────────────────────────────────────────────────────────────────────`);

if (rows.length === 0) {
  console.error("No rows to insert. Aborting.");
  process.exit(1);
}

if (DRY_RUN) {
  console.log(`\n[DRY-RUN] Would upsert ${rows.length} row(s) to upi_p2p_p2m (no DB write):`);
  for (const r of rows) {
    const p2pVolPct = ((r.p2p_volume_mn / r.total_volume_mn) * 100).toFixed(1);
    const p2mVolPct = ((r.p2m_volume_mn / r.total_volume_mn) * 100).toFixed(1);
    const p2pValPct = ((r.p2p_value_cr / r.total_value_cr) * 100).toFixed(1);
    const p2mValPct = ((r.p2m_value_cr / r.total_value_cr) * 100).toFixed(1);
    console.log(`  ${r.month} ${r.year}:`);
    console.log(`    total  vol ${r.total_volume_mn.toFixed(2)} mn   val ${r.total_value_cr.toFixed(2)} cr`);
    console.log(`    P2P    vol ${r.p2p_volume_mn.toFixed(2)} mn (${p2pVolPct}%)   val ${r.p2p_value_cr.toFixed(2)} cr (${p2pValPct}%)`);
    console.log(`    P2M    vol ${r.p2m_volume_mn.toFixed(2)} mn (${p2mVolPct}%)   val ${r.p2m_value_cr.toFixed(2)} cr (${p2mValPct}%)`);
  }
} else {
  console.log(`\nUpserting ${rows.length} rows to upi_p2p_p2m…`);
  const { error: upsertError } = await supabase
    .from("upi_p2p_p2m")
    .upsert(rows, { onConflict: "year,month_num" });

  if (upsertError) {
    console.error("UPSERT ERROR:", upsertError.message);
    process.exit(1);
  }

  // Verify
  const { data: verify, error: verifyErr } = await supabase
    .from("upi_p2p_p2m")
    .select("year, month, month_num, total_volume_mn, p2p_volume_mn, p2m_volume_mn")
    .order("year").order("month_num");

  if (verifyErr) {
    console.error("Verify error:", verifyErr.message);
  } else {
    console.log(`\nVerification — ${verify.length} rows in DB:`);
    console.log(`  First: ${verify[0]?.month} ${verify[0]?.year}  total ${verify[0]?.total_volume_mn} mn`);
    console.log(`  Last:  ${verify.at(-1)?.month} ${verify.at(-1)?.year}  total ${verify.at(-1)?.total_volume_mn} mn`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n═══ Summary ═══════════════════════════════════════════════════════════════════`);
console.log(`  Months fetched:  ${rows.length} / ${months.length}`);
console.log(`  Fetch errors:    ${fetchErrors}`);
if (warnings.length) {
  console.log(`\n  Internal validation warnings (${warnings.length}):`);
  warnings.forEach((w) => console.log(`    ⚠  ${w}`));
}
if (crossWarnings) {
  console.log(`\n  ⚠  ${crossWarnings} month(s) have >5% divergence between NPCI totals and DB app-level sums.`);
  console.log(`     This is expected if the DB includes an "Others" bucket or has rounding differences.`);
} else {
  console.log(`\n  ✓  All cross-reference diffs within 5%. Data looks consistent.`);
}
