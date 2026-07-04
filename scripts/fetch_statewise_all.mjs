/**
 * Bulk backfill: fetches statewise (and district-level) UPI statistics from
 * NPCI for all months Jan 2021 → May 2026 and upserts into
 * upi_statewise_data. For a single month, use fetch_statewise.mjs instead.
 *
 * Usage:
 *   node scripts/fetch_statewise_all.mjs [--dry-run]
 *
 * Reads credentials from .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 * RLS must be disabled on upi_statewise_data for the anon key to write.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// ---------------------------------------------------------------------------
// Load .env.local
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
    // rely on process.env
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
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: ws },
});

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Month list: Jan 2021 → Apr 2026 (matches AVAILABLE_MONTHS in queries.ts)
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
// NPCI API helpers
// ---------------------------------------------------------------------------
const BASE_URL =
  "https://www.npci.org.in/api/ecosystem-statistics/get-statistics";

function parseNum(s) {
  if (!s) return null;
  return parseFloat(String(s).replace(/,/g, ""));
}

function parsePct(s) {
  if (!s) return null;
  return parseFloat(String(s).replace("%", ""));
}

async function fetchPage(year, month, pageNo, size = 100) {
  const url =
    `${BASE_URL}?product_name=UPI&tab_name=statewise-statistic` +
    `&year=${year}&month=${month}&page_no=${pageNo}&sort_by=asc&size=${size}&locale=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${year}-${month} page ${pageNo}`);
  const json = await res.json();
  return json?.data ?? null;
}

/**
 * Fetch all rows for a month. Returns { rows, isDistrict }.
 * - isDistrict=false: statewise aggregates (district field is null on all rows)
 * - isDistrict=true:  district rows + state-total rows (state_union_territory contains "Total")
 */
async function fetchAllRows(year, month) {
  const page1 = await fetchPage(year, month, 1);
  if (!page1 || !Array.isArray(page1.results) || page1.results.length === 0) {
    return { rows: [], isDistrict: false };
  }

  const isDistrict = Boolean(page1.results[0]?.district);
  const totalCount = page1.totalCount ?? page1.results.length;
  const allResults = [...page1.results];

  if (isDistrict && allResults.length < totalCount) {
    const totalPages = Math.ceil(totalCount / 100);
    for (let p = 2; p <= totalPages; p++) {
      await new Promise((r) => setTimeout(r, 150));
      const pageData = await fetchPage(year, month, p);
      if (pageData?.results) allResults.push(...pageData.results);
    }
  }

  return { rows: allResults, isDistrict };
}

function buildRow(year, month, month_num, r, districtOverride) {
  return {
    year,
    month,
    month_num,
    state_union_territory: r.state_union_territory,
    district: districtOverride ?? r.district ?? "",
    volume_in_mn: parseNum(r.volume_in_mn),
    value_in_cr: parseNum(r.value_in_cr),
    volume_contribution: parsePct(r.volume_contribution),
    value_contribution: parsePct(r.value_contribution),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const months = buildMonthList();
let totalInserted = 0;

console.log(`Fetching ${months.length} months (${months[0].month} ${months[0].year} → ${months.at(-1).month} ${months.at(-1).year})\n`);

for (const { year, month, month_num } of months) {
  process.stdout.write(`  ${month} ${year} … `);

  let rows_raw, isDistrict;
  try {
    ({ rows: rows_raw, isDistrict } = await fetchAllRows(year, month));
  } catch (err) {
    console.error(`FETCH ERROR: ${err.message}`);
    continue;
  }

  if (rows_raw.length === 0) {
    console.warn("no data");
    continue;
  }

  let rows;
  if (!isDistrict) {
    // Statewise month: deduplicate by state (guard against API returning duplicates)
    const seen = new Map();
    for (const r of rows_raw) {
      const key = r.state_union_territory;
      if (!seen.has(key)) seen.set(key, buildRow(year, month, month_num, r, ""));
    }
    rows = Array.from(seen.values());
  } else {
    // District month: store district rows AND state-total rows separately.
    // - District rows: district = district name (non-empty)
    // - Total rows: state_union_territory contains "Total", district stored as ""
    const seen = new Map();
    for (const r of rows_raw) {
      const isTotal = r.state_union_territory.toLowerCase().includes("total");
      const district = isTotal ? "" : (r.district ?? "");
      const key = `${r.state_union_territory}||${district}`;
      if (!seen.has(key)) seen.set(key, buildRow(year, month, month_num, r, district));
    }
    rows = Array.from(seen.values());
  }

  const districtLabel = isDistrict ? ` (district-level, ${rows.filter(r => r.district).length} districts + ${rows.filter(r => !r.district).length} totals)` : " (state-level)";

  if (DRY_RUN) {
    console.log(`[DRY-RUN] ${rows.length} rows${districtLabel} — no DB write`);
    const stateRows = rows.filter((r) => !r.district);
    const top = [...stateRows].sort((a, b) => (b.volume_in_mn ?? 0) - (a.volume_in_mn ?? 0)).slice(0, 10);
    for (const r of top) {
      console.log(`    ${r.state_union_territory.padEnd(28)} vol ${(r.volume_in_mn ?? 0).toFixed(2)} mn   val ${(r.value_in_cr ?? 0).toFixed(2)} cr`);
    }
    totalInserted += rows.length;
  } else {
    const { error } = await supabase
      .from("upi_statewise_data")
      .upsert(rows, { onConflict: "year,month,state_union_territory,district" });

    if (error) {
      console.error(`UPSERT ERROR: ${error.message}`);
    } else {
      console.log(`${rows.length} rows${districtLabel}`);
      totalInserted += rows.length;
    }
  }

  await new Promise((r) => setTimeout(r, 200));
}

console.log(`\nDone. ${totalInserted} rows upserted.`);
