/**
 * One-off backfill: derives oc_name (the circular's human-readable title) for
 * existing npci_circulars rows by parsing the "Subject:" line out of the OCR'd
 * content_text (see scripts/extractSubject.mjs). Rows OCR'd after this ships
 * get oc_name written by scripts/ocr_npci_circulars.mjs directly — this fixes
 * the ~240 rows already in the table.
 *
 * Requires the add_circular_oc_name_and_search.sql migration (adds the
 * oc_name column) to be applied first.
 *
 * Like backfill_oc_numbers.mjs, defaults to a dry run with ZERO writes — it's
 * a one-off bulk rewrite of live data, so report-only until a human has read
 * the output. Only ever fills rows where oc_name is null; an existing value
 * is never overwritten.
 *
 * Usage:
 *   node scripts/backfill_oc_names.mjs [--limit N] [--id N] [--execute]
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { extractSubject } from "./extractSubject.mjs";

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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let limit = null;
  let id = null;
  let execute = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) limit = parseInt(args[++i], 10);
    else if (args[i] === "--id" && args[i + 1]) id = parseInt(args[++i], 10);
    else if (args[i] === "--execute") execute = true;
  }
  return { limit, id, execute };
}

const { limit, id, execute } = parseArgs();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });

// Page through everything — content_text rows are large, keep pages modest.
const rows = [];
for (let from = 0; ; from += 100) {
  let query = supabase
    .from("npci_circulars")
    .select("id, oc_number, oc_name, file_name, content_text, ocr_status")
    .order("id", { ascending: true })
    .range(from, from + 99);
  if (id) query = query.eq("id", id);
  const { data, error } = await query;
  if (error) {
    console.error(`Failed to load rows: ${error.message}`);
    process.exit(1);
  }
  rows.push(...data);
  if (data.length < 100 || id) break;
}
const scanned = limit ? rows.slice(0, limit) : rows;

console.log(`${execute ? "" : "[DRY RUN] "}Scanning ${scanned.length} row(s)...\n`);

const buckets = { fill: [], alreadySet: [], noSubject: [], noText: [] };

for (const row of scanned) {
  if (!row.content_text) {
    buckets.noText.push({ row, name: null });
    continue;
  }
  const name = extractSubject(row.content_text);
  if (row.oc_name != null) buckets.alreadySet.push({ row, name });
  else if (name) buckets.fill.push({ row, name });
  else buckets.noSubject.push({ row, name });
}

function printBucket(label, entries, { showName = true } = {}) {
  console.log(`\n--- ${label} (${entries.length}) ---`);
  for (const { row, name } of entries) {
    console.log(
      `  id=${String(row.id).padEnd(4)} ${String(row.oc_number ?? "—").padEnd(10)}` +
        (showName ? ` ${name ?? "—"}` : ` (file: ${row.file_name.slice(0, 70)})`),
    );
  }
}

printBucket("FILL — will be written", buckets.fill);
printBucket("ALREADY-SET — never overwritten", buckets.alreadySet);
printBucket("NO-SUBJECT — falls back to file_name in the UI", buckets.noSubject, { showName: false });
printBucket("NO-TEXT — not OCR'd yet", buckets.noText, { showName: false });

console.log(
  `\nSummary: ${buckets.fill.length} fill, ${buckets.alreadySet.length} already-set, ` +
    `${buckets.noSubject.length} no-subject, ${buckets.noText.length} no-text (of ${scanned.length} scanned)`,
);

if (!execute) {
  console.log("\nDry run — no writes made. Re-run with --execute to write the FILL bucket.");
  process.exit(0);
}

let ok = 0;
let failed = 0;
for (const { row, name } of buckets.fill) {
  const { error: upErr } = await supabase
    .from("npci_circulars")
    .update({ oc_name: name })
    .eq("id", row.id);
  if (upErr) {
    failed++;
    console.error(`  ✗ id=${row.id}: ${upErr.message}`);
  } else {
    ok++;
  }
}
console.log(`\nWrote ${ok} row(s), ${failed} failure(s).`);
