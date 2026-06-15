/**
 * Bulk backfill: fetches UPI MCC statistics from NPCI for all months
 * Jan 2021 → May 2026 and upserts into upi_mcc_codes + upi_mcc_data.
 *
 * Usage:
 *   node scripts/fetch_mcc_all.mjs [--dry-run]
 *
 * Reads credentials from .env.local. Run add_mcc_data.sql migration first.
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
// Month list — Jan 2021 → May 2026
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

async function fetchMccMonth(year, month) {
  const url =
    `${BASE_URL}?product_name=UPI&tab_name=mcc` +
    `&year=${year}&month=${month}&page_no=1&sort_by=asc&size=100&locale=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${month} ${year}`);
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
    else return null; // an unlabelled total/blank row — skip
  }
  return { ...r, mcc };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
// Reconciliation: P2M is the source of truth. The MCC tab is the P2M breakdown
// by merchant category, so the sum of every MCC category (including "Others")
// should equal the P2M total for the same month.
// ---------------------------------------------------------------------------
const RECON_TOLERANCE_PCT = 0.1;

async function loadP2MTotals() {
  const map = new Map();
  const { data, error } = await supabase
    .from("upi_p2p_p2m")
    .select("year, month_num, p2m_volume_mn, p2m_value_cr");
  if (error) {
    console.warn(`Reconciliation: could not load upi_p2p_p2m — ${error.message}`);
    return map;
  }
  for (const r of data) {
    map.set(`${r.year}-${r.month_num}`, {
      vol: Number(r.p2m_volume_mn),
      val: Number(r.p2m_value_cr),
    });
  }
  return map;
}

const fmtPct = (p) => (p == null ? "n/a" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`).padStart(8);

async function reconcileAll(monthData) {
  const p2mTotals = await loadP2MTotals();
  console.log("\n── Reconciliation: P2M (source) vs sum of all MCC categories ──────────────────");
  console.log(
    "Month       P2M val (cr)   MCC val (cr)    val Δ    P2M vol (mn)   MCC vol (mn)    vol Δ",
  );
  console.log("─".repeat(92));
  let warnings = 0;
  for (const m of monthData) {
    const p = p2mTotals.get(`${m.year}-${m.month_num}`);
    const mccVol = m.rows.reduce((a, r) => a + (parseNum(r.volume_in_mn) ?? 0), 0);
    const mccVal = m.rows.reduce((a, r) => a + (parseNum(r.value_in_cr) ?? 0), 0);
    const label = `${m.month} ${m.year}`.padEnd(10);
    if (!p) {
      console.log(`${label}  (no P2M row)`);
      continue;
    }
    const volPct = p.vol > 0 ? ((mccVol - p.vol) / p.vol) * 100 : null;
    const valPct = p.val > 0 ? ((mccVal - p.val) / p.val) * 100 : null;
    const flag =
      Math.abs(volPct ?? 0) > RECON_TOLERANCE_PCT || Math.abs(valPct ?? 0) > RECON_TOLERANCE_PCT
        ? " ⚠"
        : "";
    if (flag) warnings++;
    console.log(
      `${label}  ${p.val.toFixed(2).padStart(12)}  ${mccVal.toFixed(2).padStart(12)}  ${fmtPct(valPct)}  ` +
        `${p.vol.toFixed(2).padStart(12)}  ${mccVol.toFixed(2).padStart(12)}  ${fmtPct(volPct)}${flag}`,
    );
  }
  console.log(
    warnings
      ? `\n⚠ ${warnings} month(s) deviate from P2M by more than ${RECON_TOLERANCE_PCT}% — check NPCI source or missing categories.`
      : `\n✓ All months reconcile with P2M within ${RECON_TOLERANCE_PCT}%.`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const months = buildMonthList();
console.log(
  `${DRY_RUN ? "[DRY RUN] " : ""}Fetching MCC data for ${months.length} months` +
    ` (${months[0].month} ${months[0].year} → ${months.at(-1).month} ${months.at(-1).year})\n`,
);

// Collect all unique MCC codes across all months first
const codeMap = new Map(); // mcc -> { mcc, type, description }
const monthData = []; // { year, month, month_num, rows[] }
let fetchErrors = 0;

for (const { year, month, month_num } of months) {
  process.stdout.write(`  ${month} ${year} … `);
  let rows;
  try {
    rows = await fetchMccMonth(year, month);
  } catch (err) {
    console.error(`FETCH ERROR: ${err.message}`);
    fetchErrors++;
    await sleep(500);
    continue;
  }

  console.log(`${rows.length} rows`);

  if (DRY_RUN && year === 2024 && month === "May") {
    console.log("\n  Sample rows (May 2024):");
    for (const r of rows.slice(0, 5)) {
      console.log(
        `    [${r.type}] MCC ${r.mcc} — ${r.description}: vol=${r.volume_in_mn} val=${r.value_in_cr}`,
      );
    }
  }

  for (const r of rows) {
    if (!codeMap.has(r.mcc)) {
      codeMap.set(r.mcc, { mcc: r.mcc, type: r.type, description: r.description });
    }
  }
  monthData.push({ year, month, month_num, rows });
  await sleep(150);
}

console.log(
  `\nFetch complete. Unique MCC codes: ${codeMap.size}, months: ${monthData.length}, errors: ${fetchErrors}`,
);

await reconcileAll(monthData);

if (DRY_RUN) {
  console.log("\n[DRY RUN] MCC codes that would be upserted:");
  for (const c of codeMap.values()) {
    console.log(`  ${c.mcc.padEnd(8)} [${c.type}] ${c.description}`);
  }
  console.log(`\n[DRY RUN] Total data rows: ${monthData.reduce((s, m) => s + m.rows.length, 0)}`);
  process.exit(0);
}

// Upsert MCC dimension table
console.log("\nUpserting upi_mcc_codes …");
await upsertCodes([...codeMap.values()]);

// Load ID index
const codeIndex = await loadCodeIndex();
console.log(`Loaded ${codeIndex.size} MCC code IDs.`);

// Upsert fact rows month by month
console.log("Upserting upi_mcc_data …");
let totalDataRows = 0;

for (const { year, month, month_num, rows } of monthData) {
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
  totalDataRows += factRows.length;
  process.stdout.write(".");
}

console.log(`\n\nDone. Upserted ${codeMap.size} MCC codes and ${totalDataRows} data rows.`);
