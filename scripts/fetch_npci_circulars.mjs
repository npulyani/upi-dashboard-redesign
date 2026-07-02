/**
 * NPCI circulars ingestion: fetches UPI/RuPay operating-circular metadata from
 * NPCI, downloads each PDF into the Supabase Storage bucket "circulars", and
 * upserts a row per circular into npci_circulars (ocr_status defaults to
 * "pending"; scripts/ocr_npci_circulars.mjs fills in the text afterwards).
 *
 * Usage:
 *   node scripts/fetch_npci_circulars.mjs [--year 2026] [--dry-run]
 *
 * Defaults to all years 2022..current. The full re-pull is safe/idempotent
 * (upsert on npci_id); in steady state run once for the current year.
 * Reads credentials from .env.local.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { parseOc } from "./parseOc.mjs";

// ---------------------------------------------------------------------------
// Env (same loader as the other fetch scripts)
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

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let year = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) year = parseInt(args[++i], 10);
    else if (args[i] === "--dry-run") dryRun = true;
  }
  const current = new Date().getFullYear();
  const years = year ? [year] : [];
  if (!year) for (let y = 2016; y <= current; y++) years.push(y);
  return { years, dryRun };
}

const { years, dryRun } = parseArgs();

// ---------------------------------------------------------------------------
// NPCI fetch
// ---------------------------------------------------------------------------
const NPCI_BASE = "https://www.npci.org.in";
const API = `${NPCI_BASE}/api/circulars/upi`;
const BUCKET = "circulars";
// NPCI rejects size > 100 ("Invalid page size"); 100 is the max page size.
const PAGE_SIZE = 100;

async function fetchYear(year) {
  const kept = [];
  let totalCount = Infinity;
  let returned = 0;
  for (let pageNum = 1; returned < totalCount; pageNum++) {
    const url =
      `${API}?pageNum=${pageNum}&year=${year}&sort=desc&size=${PAGE_SIZE}&locale=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for year ${year}`);
    const json = await res.json();
    const data = json?.data ?? {};
    totalCount = Number(data.totalCount ?? 0);
    const files = Array.isArray(data.files) ? data.files : [];
    if (files.length === 0) break;
    returned += files.length;
    for (const f of files) {
      if (!f.isDownloadable || !f.isViewable) continue;
      const rel = f.media?.url ?? "";
      if (!rel) continue;
      const { oc_number, oc_base } = parseOc(f.fileName);
      kept.push({
        npci_id: f.id,
        oc_number,
        oc_base,
        file_name: f.fileName,
        media_type: f.mediaType,
        year_label: f.yearLabel,
        query_year: year,
        source_url: rel.startsWith("/") ? NPCI_BASE + rel : rel,
        storage_path: `${year}/${f.id}.pdf`,
      });
    }
    if (returned >= totalCount) break;
  }
  return { kept, totalCount };
}

// ---------------------------------------------------------------------------
// Supabase helpers (skipped in dry-run)
// ---------------------------------------------------------------------------
async function ensureBucket(supabase) {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`createBucket ${BUCKET}: ${error.message}`);
  }
}

async function uploadPdf(supabase, row) {
  const res = await fetch(row.source_url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
  });
  if (!res.ok) throw new Error(`download ${row.source_url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(row.storage_path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`upload ${row.storage_path}: ${error.message}`);
}

// Upsert metadata only — never touch ocr_status / content_text / doc_* so a
// re-fetch doesn't reset rows the OCR script has already processed.
async function upsertRow(supabase, row) {
  const { error } = await supabase
    .from("npci_circulars")
    .upsert({ ...row, fetched_at: new Date().toISOString() }, { onConflict: "npci_id" });
  if (error) throw new Error(`upsert npci_circulars: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(
  `${dryRun ? "[DRY RUN] " : ""}Fetching NPCI circulars for: ${years.join(", ")}`,
);

let supabase = null;
if (!dryRun) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });
  await ensureBucket(supabase);
}

let grandTotal = 0;
const allRows = [];

for (const year of years) {
  let kept, totalCount;
  try {
    ({ kept, totalCount } = await fetchYear(year));
  } catch (err) {
    console.error(`  ${year}: fetch failed — ${err.message}`);
    continue;
  }
  if (totalCount > PAGE_SIZE) {
    console.warn(`  ⚠ ${year}: totalCount ${totalCount} exceeds page size — verify pagination.`);
  }

  if (!dryRun) {
    let ok = 0;
    for (const row of kept) {
      try {
        await uploadPdf(supabase, row);
        await upsertRow(supabase, row);
        ok++;
      } catch (err) {
        console.error(`    ✗ npci_id ${row.npci_id}: ${err.message}`);
      }
    }
    console.log(`  ${year}: totalCount ${totalCount} → kept ${kept.length} → stored ${ok}`);
  } else {
    console.log(`  ${year}: totalCount ${totalCount} → kept ${kept.length}`);
  }
  allRows.push(...kept);
  grandTotal += kept.length;
}

console.log(`\nTotal kept: ${grandTotal}`);

if (dryRun) {
  console.log(`\n${"OC".padEnd(10)} ${"Year".padEnd(8)} ${"FY".padEnd(9)} File`);
  console.log("-".repeat(100));
  for (const r of allRows) {
    console.log(
      `${String(r.oc_number ?? "—").padEnd(10)} ${String(r.query_year).padEnd(8)} ${String(r.year_label ?? "").padEnd(9)} ${r.file_name.slice(0, 60)}`,
    );
  }
}
