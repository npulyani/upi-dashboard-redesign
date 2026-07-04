/**
 * Per-month update: fetches UPI P2P/P2M split statistics from NPCI for a
 * specific month/year and upserts into upi_p2p_p2m. For the full
 * Jan 2021 → latest history, use fetch_p2p_p2m_all.mjs.
 *
 * Validations performed:
 *   1. Internal: p2p_volume + p2m_volume ≈ total_volume (and same for value)
 *   2. External: total_volume from this API vs sum of cit_volume_mn in upi_monthly_data
 *
 * Usage:
 *   node scripts/fetch_p2p_p2m.mjs --year 2026 --month May [--dry-run]
 *
 * Defaults to May 2026 (latest available month) if args omitted.
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

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parseArgs() {
  const args = process.argv.slice(2);
  let year = 2026;
  let month = "May";
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) year = parseInt(args[++i], 10);
    else if (args[i] === "--month" && args[i + 1]) month = args[++i];
    else if (args[i] === "--dry-run") dryRun = true;
  }

  const month_num = MONTH_ABBR.indexOf(month) + 1;
  if (month_num === 0) {
    console.error(`Unknown month: "${month}". Use 3-letter abbreviation (Jan, Feb, … Dec).`);
    process.exit(1);
  }
  if (isNaN(year) || year < 2021 || year > 2030) {
    console.error(`Invalid year: ${year}`);
    process.exit(1);
  }
  return { year, month, month_num, dryRun };
}

const { year, month, month_num, dryRun: DRY_RUN } = parseArgs();

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
// Load existing upi_monthly_data total for this month (cross-reference)
// ---------------------------------------------------------------------------
async function loadExistingTotal(year, month_num) {
  const { data, error } = await supabase
    .from("upi_monthly_data")
    .select("cit_volume_mn, cit_value_cr")
    .eq("year", year)
    .eq("month_num", month_num);
  if (error) {
    console.warn("  Could not load upi_monthly_data for cross-reference:", error?.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data.reduce(
    (acc, r) => ({
      vol: acc.vol + Number(r.cit_volume_mn),
      val: acc.val + Number(r.cit_value_cr),
    }),
    { vol: 0, val: 0 },
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Fetching P2P/P2M data for ${month} ${year} …`);

let raw;
try {
  raw = await fetchMonth(year, month);
} catch (err) {
  console.error(`Fetch failed: ${err.message}`);
  process.exit(1);
}

if (!raw) {
  console.warn("No data returned from API.");
  process.exit(0);
}

const totalVol = parseNum(raw.total_volume_mn);
const totalVal = parseNum(raw.total_value_cr);
const p2pVol   = parseNum(raw.p_2_p_volume_mn);
const p2pVal   = parseNum(raw.p_2_p_value_cr);
const p2mVol   = parseNum(raw.p_2_m_volume_mn);
const p2mVal   = parseNum(raw.p_2_m_value_cr);

if (totalVol == null || p2pVol == null || p2mVol == null) {
  console.error("Missing numeric fields in API response.");
  process.exit(1);
}

console.log(`vol ${totalVol.toFixed(2)} mn  |  p2p ${((p2pVol / totalVol) * 100).toFixed(1)}%  p2m ${((p2mVol / totalVol) * 100).toFixed(1)}%\n`);

// Internal validation: p2p + p2m should equal total (allow 0.1% tolerance)
const volDiff = Math.abs(p2pVol + p2mVol - totalVol);
const valDiff = Math.abs(p2pVal + p2mVal - totalVal);
const volTol = totalVol * 0.001;
const valTol = totalVal * 0.001;
if (volDiff > volTol || valDiff > valTol) {
  console.warn(
    `⚠ INTERNAL MISMATCH — vol p2p+p2m=${(p2pVol + p2mVol).toFixed(2)} vs total=${totalVol.toFixed(2)}, ` +
      `val p2p+p2m=${(p2pVal + p2mVal).toFixed(2)} vs total=${totalVal.toFixed(2)}`,
  );
}

// Cross-reference against upi_monthly_data
const dbTotal = await loadExistingTotal(year, month_num);
if (dbTotal) {
  const volPct = dbTotal.vol > 0 ? ((totalVol - dbTotal.vol) / dbTotal.vol) * 100 : null;
  const valPct = dbTotal.val > 0 ? ((totalVal - dbTotal.val) / dbTotal.val) * 100 : null;
  const flag = (Math.abs(volPct ?? 0) > 5 || Math.abs(valPct ?? 0) > 5) ? " ⚠" : "";
  console.log("── Cross-reference: NPCI P2P/P2M total vs upi_monthly_data sum ──");
  console.log(
    `  vol: API ${totalVol.toFixed(2)}  DB ${dbTotal.vol.toFixed(2)}  diff ${volPct != null ? volPct.toFixed(2) + "%" : "n/a"}` +
      `   val: API ${totalVal.toFixed(2)}  DB ${dbTotal.val.toFixed(2)}  diff ${valPct != null ? valPct.toFixed(2) + "%" : "n/a"}${flag}\n`,
  );
} else {
  console.log("── Cross-reference: no upi_monthly_data rows for this month (skipped) ──\n");
}

const row = {
  year, month, month_num,
  total_volume_mn: totalVol, total_value_cr: totalVal,
  p2p_volume_mn: p2pVol, p2p_value_cr: p2pVal,
  p2m_volume_mn: p2mVol, p2m_value_cr: p2mVal,
};

if (DRY_RUN) {
  console.log("[DRY-RUN] Would upsert this row — no DB write:");
  console.log(`  total  vol ${totalVol.toFixed(2)} mn   val ${totalVal.toFixed(2)} cr`);
  console.log(`  P2P    vol ${p2pVol.toFixed(2)} mn   val ${p2pVal.toFixed(2)} cr`);
  console.log(`  P2M    vol ${p2mVol.toFixed(2)} mn   val ${p2mVal.toFixed(2)} cr`);
  process.exit(0);
}

const { error: upsertError } = await supabase
  .from("upi_p2p_p2m")
  .upsert([row], { onConflict: "year,month_num" });

if (upsertError) {
  console.error("UPSERT ERROR:", upsertError.message);
  process.exit(1);
}

console.log(`Upserted P2P/P2M row for ${month} ${year}.`);
