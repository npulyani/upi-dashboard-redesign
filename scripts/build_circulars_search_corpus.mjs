/**
 * Builds the client-side search corpus for the circulars page and uploads it
 * to Supabase Storage. The frontend (src/lib/upi/circularsSearch.ts) fetches
 * it once and searches in-browser with MiniSearch — no per-query DB round-trips.
 *
 * Delivery model (content-hashed + manifest):
 *   - The corpus is written to search/corpus-<hash>.json with a long,
 *     `immutable` Cache-Control so Cloudflare edge-caches it and browsers
 *     never re-download it. A NEW object path per publish is deliberate: a
 *     fixed path re-uploaded with `upsert` does NOT reliably refresh the
 *     stored Cache-Control metadata in Supabase Storage — that's why the old
 *     fixed corpus.json ended up served as `no-cache`, forcing every user to
 *     re-fetch ~1.3MB from the Supabase origin on each focus.
 *   - search/corpus-manifest.json (tiny) points at the current hashed file.
 *     The app reads the manifest first, then the hashed corpus. The manifest
 *     stays effectively uncacheable so a new corpus is picked up immediately.
 *   - The legacy fixed-path corpus.json is still written for backward compat
 *     with any app bundle deployed before the manifest change; remove it once
 *     the manifest-aware frontend is fully rolled out.
 *
 * Usage:
 *   node scripts/build_circulars_search_corpus.mjs [--dry-run]
 *
 * Run after fetch/OCR/summarize in the monthly update so new circulars become
 * searchable. Reads credentials from .env.local.
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";
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
const SEARCH_PREFIX = "search";
const MANIFEST_PATH = `${SEARCH_PREFIX}/corpus-manifest.json`;
const LEGACY_CORPUS_PATH = `${SEARCH_PREFIX}/corpus.json`;
// One year, immutable — safe because the filename is content-hashed, so any
// change ships under a new URL.
const IMMUTABLE_CACHE = "31536000, immutable";

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

  const corpus = { generated_at: new Date().toISOString(), rows };
  const body = JSON.stringify(corpus);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 12);
  const corpusPath = `${SEARCH_PREFIX}/corpus-${hash}.json`;
  console.log(
    `Corpus: ${rows.length} circulars, ${(body.length / 1e6).toFixed(2)}MB raw JSON → ${corpusPath}`,
  );

  if (dryRun) {
    console.log(`[dry-run] Skipping upload of ${corpusPath} + manifest`);
    return;
  }

  const asJson = (s) => new Blob([s], { type: "application/json" });

  // 1. Immutable, content-hashed corpus — long cache so it's edge- and
  //    browser-cached and never re-downloaded on focus.
  const up1 = await supabase.storage.from(BUCKET).upload(corpusPath, asJson(body), {
    upsert: true,
    contentType: "application/json",
    cacheControl: IMMUTABLE_CACHE,
  });
  if (up1.error) {
    console.error("Corpus upload failed:", up1.error.message);
    process.exit(1);
  }

  // 2. Manifest points the app at the current hashed file. Keep it effectively
  //    uncacheable (tiny) so a freshly built corpus is picked up immediately.
  const manifestBody = JSON.stringify({ path: corpusPath, generated_at: corpus.generated_at });
  const up2 = await supabase.storage.from(BUCKET).upload(MANIFEST_PATH, asJson(manifestBody), {
    upsert: true,
    contentType: "application/json",
    cacheControl: "60",
  });
  if (up2.error) {
    console.error("Manifest upload failed:", up2.error.message);
    process.exit(1);
  }

  // 3. Legacy fixed-path copy for app bundles deployed before the manifest
  //    change. Remove this block once the manifest-aware frontend is live.
  const up3 = await supabase.storage.from(BUCKET).upload(LEGACY_CORPUS_PATH, asJson(body), {
    upsert: true,
    contentType: "application/json",
    cacheControl: "300",
  });
  if (up3.error) console.warn("Legacy corpus.json upload failed (non-fatal):", up3.error.message);

  // 4. Prune stale corpus-<hash>.json so the bucket doesn't accumulate. Keep
  //    the current hash, the manifest, and the legacy fixed path.
  const { data: listing } = await supabase.storage.from(BUCKET).list(SEARCH_PREFIX);
  const stale = (listing ?? [])
    .map((f) => f.name)
    .filter((n) => /^corpus-[0-9a-f]{12}\.json$/.test(n) && n !== `corpus-${hash}.json`);
  if (stale.length) {
    await supabase.storage.from(BUCKET).remove(stale.map((n) => `${SEARCH_PREFIX}/${n}`));
    console.log(`Pruned ${stale.length} stale corpus file(s).`);
  }

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(corpusPath).data.publicUrl;
  console.log(`Uploaded ${corpusPath}`);

  // 5. Self-verify the served headers against the production CDN — the whole
  //    point of the change is that this file is now cacheable. Two fetches:
  //    the second should report a Cloudflare cache HIT.
  try {
    const h1 = await fetch(publicUrl, { headers: { "Accept-Encoding": "br, gzip" } });
    const cc = h1.headers.get("cache-control");
    const enc = h1.headers.get("content-encoding");
    const h2 = await fetch(publicUrl, { headers: { "Accept-Encoding": "br, gzip" } });
    const cf2 = h2.headers.get("cf-cache-status");
    console.log(`Served cache-control: ${cc} | content-encoding: ${enc} | 2nd-hit cf-cache: ${cf2}`);
    if (!cc || /no-cache|no-store|max-age=0/.test(cc)) {
      console.warn("⚠ Corpus is NOT cacheable — Cache-Control did not apply as expected.");
    }
  } catch (e) {
    console.warn("Header self-check skipped:", e.message);
  }
}

main();
