/**
 * Fetch UPI app-wise monthly data from NPCI and:
 *   1. Save as public/data/{year}-{month}.json  (local cache, same format as existing files)
 *   2. Sync upi_apps — fuzzy-match new raw names against existing apps;
 *      add to raw_names[] if matched, insert new row if genuinely new
 *   3. Upsert into Supabase upi_monthly_data (with app_id FK)
 *
 * Usage:
 *   node scripts/fetch_upi_apps.mjs                     # defaults to Apr 2026
 *   node scripts/fetch_upi_apps.mjs --year 2026 --month Apr
 *   node scripts/fetch_upi_apps.mjs --year 2025 --month Dec
 *
 * Reads credentials from .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).
 * RLS must be disabled on both upi_apps and upi_monthly_data for the anon key to write.
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

const DRY_RUN = process.argv.includes("--dry-run");

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
// Fuzzy-match helpers
// Strips trailing #, "App"/"Apps", punctuation, whitespace to a bare token
// so "Google Pay #" and "Google Pay" both normalize to "googlepay".
// ---------------------------------------------------------------------------
function normalizeForMatch(name) {
  return name
    .toLowerCase()
    .replace(/#/g, "")            // remove trailing hash (NPCI Apr 2026+ naming)
    .replace(/\bapps?\b/gi, "")   // remove "App" or "Apps" word
    .replace(/[^a-z0-9]/g, "")    // strip all non-alphanumeric
    .trim();
}

// ---------------------------------------------------------------------------
// One-time merge corrections (idempotent):
// Duplicate upi_apps rows created with wrong canonical names get merged into
// the correct existing row — raw_names consolidated, FK updated, dupe deleted.
// ---------------------------------------------------------------------------
const MERGE_FIXES = [
  { wrongCanonical: "Slice Small Finance Bank Apps", correctCanonical: "Slice" },
  { wrongCanonical: "FamApp by Trio #",              correctCanonical: "FamPay" },
  { wrongCanonical: "Tata Pay #",                    correctCanonical: "Tata Neu" },
];

async function applyCanonicalFixes() {
  for (const { wrongCanonical, correctCanonical } of MERGE_FIXES) {
    // Find the wrong row (dupe)
    const { data: wrongRow } = await supabase
      .from("upi_apps")
      .select("id, raw_names")
      .eq("canonical_name", wrongCanonical)
      .maybeSingle();

    if (!wrongRow) continue; // already merged

    // Find the correct target row
    const { data: correctRow } = await supabase
      .from("upi_apps")
      .select("id, raw_names")
      .eq("canonical_name", correctCanonical)
      .maybeSingle();

    if (!correctRow) {
      console.warn(`  ⚠️   Target "${correctCanonical}" not found — skipping merge`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ✏️   (dry-run) would merge "${wrongCanonical}" → "${correctCanonical}"`);
      continue;
    }

    // 1. Re-point upi_monthly_data FK from wrong → correct
    await supabase
      .from("upi_monthly_data")
      .update({ app_id: correctRow.id })
      .eq("app_id", wrongRow.id);

    // 2. Merge raw_names into the correct row
    const merged = [...new Set([...(correctRow.raw_names ?? []), ...(wrongRow.raw_names ?? [])])];
    await supabase
      .from("upi_apps")
      .update({ raw_names: merged })
      .eq("id", correctRow.id);

    // 3. Delete the duplicate row
    const { error: delErr } = await supabase
      .from("upi_apps")
      .delete()
      .eq("id", wrongRow.id);

    if (delErr) console.warn(`  ⚠️   Could not delete dupe "${wrongCanonical}": ${delErr.message}`);
    else console.log(`  ✏️   Merged "${wrongCanonical}" → "${correctCanonical}"`);
  }
}

// ---------------------------------------------------------------------------
// Sync upi_apps: match / insert, return { appIdMap, canonicalMap }
// ---------------------------------------------------------------------------
async function syncApps(appNamesRaw) {
  // Load all existing apps (after fixes have been applied)
  const { data: existingApps, error } = await supabase
    .from("upi_apps")
    .select("id, canonical_name, raw_names");

  if (error) throw new Error(`Failed to fetch upi_apps: ${error.message}`);

  // Build lookup tables
  const rawNameToId = new Map();          // exact raw_name → app_id
  const rawNameToCanonical = new Map();   // exact raw_name → canonical_name
  const normalizedToApp = new Map();      // normalized key → app row

  for (const app of existingApps) {
    const norm = normalizeForMatch(app.canonical_name);
    if (!normalizedToApp.has(norm)) normalizedToApp.set(norm, app);

    for (const rn of app.raw_names ?? []) {
      rawNameToId.set(rn, app.id);
      rawNameToCanonical.set(rn, app.canonical_name);
      const rnNorm = normalizeForMatch(rn);
      if (!normalizedToApp.has(rnNorm)) normalizedToApp.set(rnNorm, app);
    }
  }

  const appIdMap = new Map();       // app_name_raw → app_id (final)
  const canonicalMap = new Map();   // app_name_raw → canonical_name (final)
  const toAddRawName = [];          // { appId, app, newRawName } — add raw name to existing app
  const toInsert = [];              // raw names that need a brand-new upi_apps row

  for (const rawName of appNamesRaw) {
    // 1. Exact match
    if (rawNameToId.has(rawName)) {
      appIdMap.set(rawName, rawNameToId.get(rawName));
      canonicalMap.set(rawName, rawNameToCanonical.get(rawName));
      continue;
    }

    // 2. Fuzzy match via normalization
    const norm = normalizeForMatch(rawName);
    if (normalizedToApp.has(norm)) {
      const app = normalizedToApp.get(norm);
      appIdMap.set(rawName, app.id);
      canonicalMap.set(rawName, app.canonical_name);
      toAddRawName.push({ appId: app.id, app, newRawName: rawName });
      continue;
    }

    // 3. Genuinely new app
    toInsert.push(rawName);
  }

  // Update existing apps with new raw name variants
  for (const { appId, app, newRawName } of toAddRawName) {
    if (DRY_RUN) {
      console.log(`  🔗  (dry-run) would map "${newRawName}" → ${app.canonical_name}`);
      continue;
    }
    const updatedRawNames = [...new Set([...(app.raw_names ?? []), newRawName])];
    const { error: updErr } = await supabase
      .from("upi_apps")
      .update({ raw_names: updatedRawNames })
      .eq("id", appId);
    if (updErr) {
      console.warn(`  ⚠️   Could not add "${newRawName}" to ${app.canonical_name}: ${updErr.message}`);
    } else {
      console.log(`  🔗  Mapped  "${newRawName}" → ${app.canonical_name}`);
    }
  }

  // Insert genuinely new apps
  if (toInsert.length > 0 && DRY_RUN) {
    for (const name of toInsert) {
      console.log(`  🆕  (dry-run) would insert new app "${name}"`);
    }
  } else if (toInsert.length > 0) {
    const newRows = toInsert.map((name) => ({
      canonical_name: name,
      raw_names: [name],
      logo_domain: null,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("upi_apps")
      .insert(newRows)
      .select("id, canonical_name, raw_names");

    if (insErr) {
      console.error(`  ❌  Failed to insert new apps: ${insErr.message}`);
    } else {
      for (const row of inserted) {
        appIdMap.set(row.raw_names[0], row.id);
        canonicalMap.set(row.raw_names[0], row.canonical_name);
        console.log(`  🆕  New app  "${row.canonical_name}" (id=${row.id})`);
      }
    }
  }

  if (toAddRawName.length === 0 && toInsert.length === 0) {
    console.log("  ✅  No new apps — upi_apps is up to date");
  }

  return { appIdMap, canonicalMap };
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

console.log(`  Fetched ${rawRows.length} raw rows → ${rows.length} valid rows after dedup/filter\n`);

const dataDir = resolve(ROOT, "public", "data");
mkdirSync(dataDir, { recursive: true });
const localPath = resolve(dataDir, `${year}-${month}.json`);

// ---------------------------------------------------------------------------
// 2. Fix canonical names + sync upi_apps
// ---------------------------------------------------------------------------
console.log("  Fixing canonical names …");
await applyCanonicalFixes();

console.log("\n  Syncing upi_apps …");
let appIdMap, canonicalMap;
try {
  ({ appIdMap, canonicalMap } = await syncApps(rows.map((r) => r.app_name_raw)));
} catch (err) {
  console.error(`  ❌  ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Save locally — app_name pulled from Supabase canonical_name
// ---------------------------------------------------------------------------
const localRows = rows.map((r) => ({
  ...r,
  app_name: canonicalMap.get(r.app_name_raw) ?? r.app_name_raw,
}));
writeFileSync(localPath, JSON.stringify(localRows, null, 2), "utf8");
console.log(`\n  ✅  Saved locally → public/data/${year}-${month}.json`);

// ---------------------------------------------------------------------------
// 3. Upsert into Supabase upi_monthly_data
// ---------------------------------------------------------------------------
console.log("\n  Upserting into upi_monthly_data …");

const supabaseRows = rows
  .map(({ app_name_raw, year, month, month_num, cit_volume_mn, cit_value_cr }) => {
    const app_id = appIdMap.get(app_name_raw);
    if (!app_id) {
      console.warn(`  ⚠️   Skipping "${app_name_raw}" — no app_id resolved`);
      return null;
    }
    return { app_id, app_name_raw, year, month, month_num, cit_volume_mn, cit_value_cr };
  })
  .filter(Boolean);

if (DRY_RUN) {
  console.log(`  [DRY-RUN] Would upsert ${supabaseRows.length} rows into upi_monthly_data (no DB write)`);
  const top = [...supabaseRows].sort((a, b) => (b.cit_volume_mn ?? 0) - (a.cit_volume_mn ?? 0)).slice(0, 15);
  console.log(`\n  Top apps by volume for ${month} ${year}:`);
  for (const r of top) {
    const canonical = canonicalMap.get(r.app_name_raw) ?? r.app_name_raw;
    console.log(`    ${canonical.padEnd(22)} vol ${(r.cit_volume_mn ?? 0).toFixed(2)} mn   val ${(r.cit_value_cr ?? 0).toFixed(2)} cr`);
  }
} else {
  const { error: upsertError } = await supabase
    .from("upi_monthly_data")
    .upsert(supabaseRows, { onConflict: "year,month,app_name_raw" });

  if (upsertError) {
    console.error(`  ❌  Supabase upsert error: ${upsertError.message}`);
    process.exit(1);
  } else {
    console.log(`  ✅  Upserted ${supabaseRows.length} rows into upi_monthly_data`);
  }
}

console.log(`\nDone. ${month} ${year} data is ready.\n`);
