/**
 * Fetch UPI app-wise monthly data from NPCI and:
 *   1. Save as public/data/{year}-{month}.json  (local cache, same format as existing files)
 *   2. Upsert into Supabase upi_monthly_data table
 *
 * Usage:
 *   node scripts/fetch_upi_apps.mjs                     # defaults to Apr 2026
 *   node scripts/fetch_upi_apps.mjs --year 2026 --month Apr
 *   node scripts/fetch_upi_apps.mjs --year 2025 --month Dec
 *
 * Reads credentials from .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // fall back to process.env
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
  console.error("❌  Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: ws },
});

// ---------------------------------------------------------------------------
// CLI args  (--year 2026 --month Apr)
// ---------------------------------------------------------------------------
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parseArgs() {
  const args = process.argv.slice(2);
  let year = 2026;
  let month = "Apr";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) year = parseInt(args[++i], 10);
    if (args[i] === "--month" && args[i + 1]) month = args[++i];
  }
  const month_num = MONTH_ABBR.indexOf(month) + 1;
  if (month_num === 0) {
    console.error(`❌  Unknown month "${month}". Use 3-letter abbreviation e.g. Apr`);
    process.exit(1);
  }
  return { year, month, month_num };
}

// ---------------------------------------------------------------------------
// NPCI API helpers
// ---------------------------------------------------------------------------
const BASE_URL = "https://www.npci.org.in/api/ecosystem-statistics/get-statistics";

function parseNum(s) {
  if (s == null || s === "-") return null;
  const n = parseFloat(String(s).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

async function fetchPage(year, month, pageNo, size = 100) {
  const url =
    `${BASE_URL}?product_name=UPI&tab_name=upi-apps` +
    `&year=${year}&month=${month}&page_no=${pageNo}&sort_by=asc&size=${size}&locale=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${year}-${month} page ${pageNo}`);
  const json = await res.json();
  return json?.data ?? null;
}

async function fetchAllRows(year, month) {
  const page1 = await fetchPage(year, month, 1);
  if (!page1 || !Array.isArray(page1.results) || page1.results.length === 0) {
    return [];
  }

  const totalCount = page1.totalCount ?? page1.results.length;
  const allResults = [...page1.results];

  if (allResults.length < totalCount) {
    const totalPages = Math.ceil(totalCount / 100);
    for (let p = 2; p <= totalPages; p++) {
      await new Promise((r) => setTimeout(r, 200));
      const pageData = await fetchPage(year, month, p);
      if (pageData?.results) allResults.push(...pageData.results);
    }
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// Map API row → our schema
// ---------------------------------------------------------------------------
function mapRow(r, year, month, month_num) {
  const app_name_raw = (r.application_name ?? "").trim();
  return {
    app_name_raw,
    year,
    month,
    month_num,
    cit_volume_mn: parseNum(r.customer_initiated_transactions_volume_mn),
    cit_value_cr:  parseNum(r.customer_initiated_transactions_value_cr),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const { year, month, month_num } = parseArgs();
console.log(`\nFetching UPI apps data for ${month} ${year} …\n`);

let rawRows;
try {
  rawRows = await fetchAllRows(year, month);
} catch (err) {
  console.error(`❌  Fetch error: ${err.message}`);
  process.exit(1);
}

if (rawRows.length === 0) {
  console.warn(`⚠️   No data returned for ${month} ${year}. NPCI may not have published it yet.`);
  process.exit(0);
}

// Deduplicate by app name (guard against API returning duplicates)
const seen = new Map();
for (const r of rawRows) {
  const row = mapRow(r, year, month, month_num);
  if (row.app_name_raw && !seen.has(row.app_name_raw)) {
    seen.set(row.app_name_raw, row);
  }
}
const rows = Array.from(seen.values()).filter(
  (r) => r.cit_volume_mn !== null && r.cit_volume_mn > 0
);

console.log(`  Fetched ${rawRows.length} raw rows → ${rows.length} valid rows after dedup/filter`);

// ---------------------------------------------------------------------------
// 1. Save locally to public/data/{year}-{month}.json
// ---------------------------------------------------------------------------
const dataDir = resolve(ROOT, "public", "data");
mkdirSync(dataDir, { recursive: true });
const localPath = resolve(dataDir, `${year}-${month}.json`);

// For local JSON, set app_name = app_name_raw (canonical mapping lives in Supabase)
const localRows = rows.map((r) => ({ ...r, app_name: r.app_name_raw }));
writeFileSync(localPath, JSON.stringify(localRows, null, 2), "utf8");
console.log(`  ✅  Saved locally → public/data/${year}-${month}.json`);

// ---------------------------------------------------------------------------
// 2. Upsert into Supabase upi_monthly_data
// ---------------------------------------------------------------------------
const supabaseRows = rows.map(({ app_name_raw, year, month, month_num, cit_volume_mn, cit_value_cr }) => ({
  app_name_raw, year, month, month_num, cit_volume_mn, cit_value_cr,
}));

const { error } = await supabase
  .from("upi_monthly_data")
  .upsert(supabaseRows, { onConflict: "year,month,app_name_raw" });

if (error) {
  console.error(`  ❌  Supabase upsert error: ${error.message}`);
  process.exit(1);
} else {
  console.log(`  ✅  Upserted ${supabaseRows.length} rows into Supabase upi_monthly_data`);
}

console.log(`\nDone. ${month} ${year} data is ready.\n`);
