/**
 * Builds the client-side search corpus for the circulars page and uploads it
 * to Supabase Storage at circulars/search/corpus.json. The frontend
 * (src/lib/upi/circularsSearch.ts) fetches it once and searches in-browser
 * with MiniSearch — no per-query DB round-trips.
 *
 * The corpus embeds a PREBUILT MiniSearch index (`index`), so the browser
 * deserializes it with `loadJSON` (~20ms) instead of re-tokenizing every
 * circular's content_text via `addAll` (~150ms desktop, seconds on a low-end
 * phone). The `addAll` build was a synchronous main-thread block — it froze
 * the page on focus and popped Chrome's "page unresponsive" dialog.
 *
 * Caching: Supabase serves this object as `Cache-Control: max-age=300` on GET
 * (Cloudflare edge-caches it — verified). NOTE: a `curl -I`/HEAD request
 * misreports it as `no-cache`; always check with GET.
 *
 * Usage:
 *   node scripts/build_circulars_search_corpus.mjs [--dry-run]
 *
 * Run after fetch/OCR/summarize so new circulars become searchable.
 * Reads credentials from .env.local.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import MiniSearch from "minisearch";
import ws from "ws";

// MUST stay identical to MINISEARCH_OPTIONS in src/lib/upi/circularsSearch.ts —
// the serialized index can only be re-loaded with the same field config.
// Deliberate duplication (scripts/ and src/ are separate build contexts).
const MINISEARCH_OPTIONS = {
  fields: ["oc_name", "content_text", "file_name"],
  searchOptions: { prefix: true, fuzzy: 0.2, combineWith: "OR", boost: { oc_name: 3 } },
};

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
// created_at must stay in both selects — it drives the 30-day "New" badge,
// which would otherwise silently vanish in keyword-search results.
const CORPUS_COLUMNS =
  "id, npci_id, oc_number, oc_base, oc_name, file_name, doc_reference, doc_date, query_year, ocr_status, content_text, storage_path, source_url, created_at, summary_category:summary->>category, summary_action_items:summary->action_items";

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

  // Prebuild the MiniSearch index here so the browser can `loadJSON` it
  // (~20ms) instead of re-tokenizing every content_text via `addAll`
  // (~150ms desktop, seconds on a low-end phone → main-thread freeze).
  const mini = new MiniSearch(MINISEARCH_OPTIONS);
  mini.addAll(rows);
  const corpus = { generated_at: new Date().toISOString(), rows, index: JSON.stringify(mini) };
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
      // GET is served `max-age=300` and edge-cached (verified). Fixed path so
      // the app fetches one known URL; updates propagate within ~5 min.
      cacheControl: "300",
    });
  if (upErr) {
    console.error("Upload failed:", upErr.message);
    process.exit(1);
  }

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(CORPUS_PATH).data.publicUrl;
  console.log(`Uploaded ${publicUrl}`);

  // Self-verify caching against the production CDN via GET (HEAD misreports
  // Supabase cache headers as no-cache). Second fetch should be a cache HIT.
  try {
    const h1 = await fetch(publicUrl, { headers: { "Accept-Encoding": "br, gzip" } });
    const h2 = await fetch(publicUrl, { headers: { "Accept-Encoding": "br, gzip" } });
    console.log(
      `Served cache-control: ${h1.headers.get("cache-control")} | ` +
        `content-encoding: ${h1.headers.get("content-encoding")} | ` +
        `2nd-hit cf-cache: ${h2.headers.get("cf-cache-status")}`,
    );
  } catch (e) {
    console.warn("Header self-check skipped:", e.message);
  }
}

main();
