/**
 * Per-month MCC update: fetches UPI MCC statistics for a specific month/year
 * and upserts into upi_mcc_codes + upi_mcc_data.
 *
 * Usage:
 *   node scripts/fetch_mcc.mjs --year 2026 --month May [--dry-run]
 *
 * Defaults to May 2026 (latest available month) if args omitted.
 * Reads credentials from .env.local.
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
const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

const { year, month, month_num, dryRun } = parseArgs();

// ---------------------------------------------------------------------------
// NPCI fetch
// ---------------------------------------------------------------------------
const BASE_URL = "https://www.npci.org.in/api/ecosystem-statistics/get-statistics";

function parseNum(s) {
  if (s == null || s === "") return null;
  return parseFloat(String(s).replace(/,/g, ""));
}

async function fetchMccMonth(y, m) {
  const url =
    `${BASE_URL}?product_name=UPI&tab_name=mcc` +
    `&year=${y}&month=${m}&page_no=1&sort_by=asc&size=100&locale=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const tableDetail = json?.data?.results?.tableDetail;
  if (!Array.isArray(tableDetail) || tableDetail.length === 0) return [];
  return tableDetail.map(normalizeMccRow).filter((r) => r !== null);
}

// NPCI's row shapes vary by month:
//   • Total row     — description "Total" (mcc usually null). Always dropped.
//   • Others bucket — historically mcc "Others"; in some 2026 months mcc is null
//     with description "Others". Keyed as "Others" so it is never confused with Total.
// Returns null for rows that should be skipped.
function normalizeMccRow(r) {
  const desc = (r.description ?? "").trim();
  if (desc === "Total") return null;
  let mcc = r.mcc;
  if (mcc == null) {
    if (desc === "Others") mcc = "Others";
    else return null;
  }
  return { ...r, mcc };
}

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------
async function upsertCodes(codes) {
  const { error } = await supabase.from("upi_mcc_codes").upsert(codes, { onConflict: "mcc" });
  if (error) throw new Error(`upsert upi_mcc_codes: ${error.message}`);
}

async function loadCodeIndex() {
  const { data, error } = await supabase.from("upi_mcc_codes").select("id, mcc");
  if (error) throw new Error(`load upi_mcc_codes: ${error.message}`);
  const index = new Map();
  for (const r of data) index.set(r.mcc, r.id);
  return index;
}

async function upsertData(rows) {
  const { error } = await supabase
    .from("upi_mcc_data")
    .upsert(rows, { onConflict: "mcc_id,year,month_num" });
  if (error) throw new Error(`upsert upi_mcc_data: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Reconciliation: P2M is the source of truth. Because the MCC tab is the P2M
// breakdown by merchant category, the sum of every MCC category (including the
// "Others" catch-all) should equal the P2M total for the same month.
// ---------------------------------------------------------------------------
const RECON_TOLERANCE_PCT = 0.1;

function fmtPct(p) {
  return p == null ? "n/a" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
}

async function reconcileWithP2M(year, monthNum, rows) {
  const { data, error } = await supabase
    .from("upi_p2p_p2m")
    .select("p2m_volume_mn, p2m_value_cr")
    .eq("year", year)
    .eq("month_num", monthNum)
    .maybeSingle();

  console.log("── Reconciliation: P2M (source) vs sum of all MCC categories ──");
  if (error) {
    console.warn(`  Skipped: ${error.message}\n`);
    return;
  }
  if (!data) {
    console.warn(
      `  Skipped: no upi_p2p_p2m row for ${year}-${String(monthNum).padStart(2, "0")}.\n`,
    );
    return;
  }

  const mccVol = rows.reduce((a, r) => a + (parseNum(r.volume_in_mn) ?? 0), 0);
  const mccVal = rows.reduce((a, r) => a + (parseNum(r.value_in_cr) ?? 0), 0);
  const p2mVol = Number(data.p2m_volume_mn);
  const p2mVal = Number(data.p2m_value_cr);
  const volPct = p2mVol > 0 ? ((mccVol - p2mVol) / p2mVol) * 100 : null;
  const valPct = p2mVal > 0 ? ((mccVal - p2mVal) / p2mVal) * 100 : null;
  const flagged =
    Math.abs(volPct ?? 0) > RECON_TOLERANCE_PCT || Math.abs(valPct ?? 0) > RECON_TOLERANCE_PCT;

  console.log(
    `  volume   P2M ${p2mVol.toFixed(2)} mn   MCC ${mccVol.toFixed(2)} mn   diff ${fmtPct(volPct)}`,
  );
  console.log(
    `  value    P2M ${p2mVal.toFixed(2)} cr   MCC ${mccVal.toFixed(2)} cr   diff ${fmtPct(valPct)}`,
  );
  console.log(
    flagged
      ? `  ⚠ MCC sum deviates from P2M by more than ${RECON_TOLERANCE_PCT}% — check NPCI source or missing categories.\n`
      : `  ✓ MCC sum matches P2M within ${RECON_TOLERANCE_PCT}%.\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`${dryRun ? "[DRY RUN] " : ""}Fetching MCC data for ${month} ${year} …`);

let rows;
try {
  rows = await fetchMccMonth(year, month);
} catch (err) {
  console.error(`Fetch failed: ${err.message}`);
  process.exit(1);
}

if (rows.length === 0) {
  console.warn("No data returned from API.");
  process.exit(0);
}

console.log(`Fetched ${rows.length} MCC rows.\n`);

await reconcileWithP2M(year, month_num, rows);

if (dryRun) {
  console.log("MCC rows that would be upserted:");
  console.log(
    `${"MCC".padEnd(10)} ${"Type".padEnd(30)} ${"Vol (Mn)".padStart(12)} ${"Val (Cr)".padStart(14)}  Description`,
  );
  console.log("-".repeat(110));
  for (const r of rows) {
    console.log(
      `${String(r.mcc).padEnd(10)} ${r.type.padEnd(30)} ${String(r.volume_in_mn ?? "").padStart(12)} ${String(r.value_in_cr ?? "").padStart(14)}  ${r.description}`,
    );
  }
  process.exit(0);
}

// Upsert dimension rows
const codes = rows.map((r) => ({ mcc: r.mcc, type: r.type, description: r.description }));
await upsertCodes(codes);
console.log(`Upserted ${codes.length} MCC codes.`);

// Load ID index
const codeIndex = await loadCodeIndex();

// Upsert fact rows
const factRows = rows
  .filter((r) => codeIndex.has(r.mcc))
  .map((r) => ({
    mcc_id: codeIndex.get(r.mcc),
    year,
    month,
    month_num,
    volume_mn: parseNum(r.volume_in_mn),
    value_cr: parseNum(r.value_in_cr),
  }));

await upsertData(factRows);
console.log(`Upserted ${factRows.length} data rows for ${month} ${year}.`);
