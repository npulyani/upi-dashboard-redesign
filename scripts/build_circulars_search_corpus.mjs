/**
 * Builds the client-side search corpus for the circulars page and uploads it
 * to Supabase Storage at circulars/search/corpus.json. The frontend
 * (src/lib/upi/circularsSearch.ts) fetches it once and searches in-browser
 * with MiniSearch — no per-query DB round-trips.
 *
 * Usage:
 *   node scripts/build_circulars_search_corpus.mjs [--dry-run]
 *
 * Run after fetch/OCR/summarize in the monthly update so new circulars become
 * searchable. Safe/idempotent: upserts the single corpus object in place.
 * Reads credentials from .env.local.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

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

const dryRun = process.argv.includes("--dry-run");

const BUCKET = "circulars";
const CORPUS_PATH = "search/corpus.json";

// Same row shape as CIRCULAR_LIST_COLUMNS (src/lib/upi/circularsQueryOptions.ts)
// plus content_text, so corpus rows drop straight into the list components.
const CORPUS_COLUMNS =
  "id, npci_id, oc_number, oc_base, oc_name, file_name, doc_reference, doc_date, query_year, ocr_status, content_text, storage_path, source_url, summary_category:summary->>category, summary_action_items:summary->action_items";

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { transport: ws },
  });

  // Page through explicitly — PostgREST caps a single select at 1000 rows,
  // fine today (~240 circulars) but don't let the corpus silently truncate.
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("npci_circulars")
      .select(CORPUS_COLUMNS)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("Fetch failed:", error.message);
      process.exit(1);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const corpus = { generated_at: new Date().toISOString(), rows };
  const body = JSON.stringify(corpus);
  console.log(`Corpus: ${rows.length} circulars, ${(body.length / 1e6).toFixed(2)}MB raw JSON`);

  if (dryRun) {
    console.log(`[dry-run] Skipping upload to ${BUCKET}/${CORPUS_PATH}`);
    return;
  }

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(CORPUS_PATH, new Blob([body], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
      // Fixed path, short TTL: monthly updates propagate within minutes
      // without cache-busting the URL.
      cacheControl: "300",
    });
  if (upErr) {
    console.error("Upload failed:", upErr.message);
    process.exit(1);
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(CORPUS_PATH);
  console.log(`Uploaded to ${pub.publicUrl}`);
}

main();
