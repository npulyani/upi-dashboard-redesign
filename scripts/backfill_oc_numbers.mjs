/**
 * One-off backfill: re-derives oc_number/oc_base for existing npci_circulars
 * rows using the improved parseOc() (see scripts/parseOc.mjs) against
 * doc_reference first (authoritative, OCR'd from the PDF body), falling back
 * to file_name. Needed because scripts/ocr_npci_circulars.mjs only fixes rows
 * OCR'd *after* that change ships — this retroactively fixes the ~97 rows
 * already OCR'd under the old (narrower) regex / file_name-only logic.
 *
 * Unlike every other script here, this one defaults to a dry run with ZERO
 * writes — it's a one-off bulk rewrite of already-live production data with
 * no rollback, not an idempotent per-record upsert against a stable external
 * source, so the safer default is report-only until a human has read it.
 *
 * Only ever WRITES the "fill" bucket (oc_number was null, a candidate was
 * found) — an existing non-null oc_number is never overwritten, even if the
 * doc_reference-derived candidate disagrees with it. Disagreements are only
 * ever reported; the OCR pipeline itself is occasionally flaky (see the two
 * known-garbage doc_reference rows below), so a disagreement doesn't always
 * mean the stored value was wrong.
 *
 * Usage:
 *   node scripts/backfill_oc_numbers.mjs [--limit N] [--id N] [--execute]
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

// Known rows where the OCR pipeline itself wrote garbage into doc_reference
// (a giant chunk of unrelated body text, or just ","). Separate, unrelated
// OCR-quality bug — out of scope here, just called out so they aren't
// confused with genuine still-null rows during review.
const KNOWN_OCR_GARBAGE_IDS = new Set([134, 147]);

const YEAR_LIKE_RE = /^OC (19|20)\d\d$/;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });

let query = supabase
  .from("npci_circulars")
  .select("id, npci_id, oc_number, oc_base, file_name, doc_reference")
  .order("id", { ascending: true });
if (id) query = query.eq("id", id);
if (limit) query = query.limit(limit);

const { data: rows, error } = await query;
if (error) {
  console.error(`Failed to load rows: ${error.message}`);
  process.exit(1);
}

console.log(`${execute ? "" : "[DRY RUN] "}Scanning ${rows.length} row(s)...\n`);

const buckets = { fill: [], confirm: [], disagree: [], stillNull: [], regressionFlag: [] };

for (const row of rows) {
  let candidate = parseOc(row.doc_reference);
  let source = "doc_reference";
  if (!candidate.oc_number) {
    candidate = parseOc(row.file_name);
    source = "file_name";
  }

  const entry = { row, candidate, source };

  if (row.oc_number == null && candidate.oc_number != null) {
    buckets.fill.push(entry);
  } else if (row.oc_number != null && candidate.oc_number != null) {
    if (candidate.oc_number === row.oc_number) buckets.confirm.push(entry);
    else buckets.disagree.push(entry);
  } else if (row.oc_number != null && candidate.oc_number == null) {
    buckets.regressionFlag.push(entry);
  } else {
    buckets.stillNull.push(entry);
  }
}

function printBucket(name, entries, { showCandidate = true } = {}) {
  console.log(`\n--- ${name} (${entries.length}) ---`);
  for (const { row, candidate, source } of entries) {
    const known = KNOWN_OCR_GARBAGE_IDS.has(row.id) ? " [known OCR-garbage doc_reference, unrelated bug]" : "";
    const suspicious =
      candidate.oc_number && YEAR_LIKE_RE.test(candidate.oc_number) ? " ⚠ SUSPICIOUS (looks like a year)" : "";
    const label = showCandidate
      ? `${String(row.oc_number ?? "—").padEnd(10)} -> ${String(candidate.oc_number ?? "—").padEnd(10)} (from ${source})`
      : `${String(row.oc_number ?? "—").padEnd(10)}`;
    console.log(
      `  id=${row.id} ${label}${suspicious}${known}\n` +
        `    file_name:     ${row.file_name.slice(0, 80)}\n` +
        `    doc_reference: ${(row.doc_reference ?? "(null)").slice(0, 80)}`,
    );
  }
}

printBucket("FILL — will be written", buckets.fill);
printBucket("CONFIRM — already correct, no-op", buckets.confirm);
printBucket("DISAGREE — reported only, never written", buckets.disagree);
printBucket("REGRESSION-FLAG — existing value, candidate is null, not touched", buckets.regressionFlag, {
  showCandidate: false,
});
printBucket("STILL-NULL — expected (PD/GEN/pre-2016 style refs)", buckets.stillNull, { showCandidate: false });

console.log(
  `\nSummary: ${buckets.fill.length} fill, ${buckets.confirm.length} confirm, ` +
    `${buckets.disagree.length} disagree, ${buckets.regressionFlag.length} regression-flag, ` +
    `${buckets.stillNull.length} still-null (of ${rows.length} scanned)`,
);

if (!execute) {
  console.log("\nDry run — no writes made. Re-run with --execute to write the FILL bucket.");
  process.exit(0);
}

let ok = 0;
let failed = 0;
for (const { row, candidate } of buckets.fill) {
  const { error: upErr } = await supabase
    .from("npci_circulars")
    .update({ oc_number: candidate.oc_number, oc_base: candidate.oc_base })
    .eq("id", row.id);
  if (upErr) {
    failed++;
    console.error(`  ✗ id=${row.id}: ${upErr.message}`);
  } else {
    ok++;
  }
}
console.log(`\nWrote ${ok} row(s), ${failed} failure(s).`);
