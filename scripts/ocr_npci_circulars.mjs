/**
 * OCR worker for NPCI circulars. Every NPCI PDF is a scanned image with no text
 * layer, so this sends each PDF to Claude (which rasterizes + transcribes it
 * server-side) and writes the verbatim text into npci_circulars.content_text,
 * which feeds the generated full-text-search column.
 *
 * Resumable: only touches rows with ocr_status 'pending' (or 'failed' with
 * --retry-failed). Failures are recorded per-row and do not abort the batch.
 *
 * Usage:
 *   node scripts/ocr_npci_circulars.mjs [--limit N] [--oc "OC 193A"] [--retry-failed] [--dry-run]
 *
 * Reads credentials from .env.local (Supabase + ANTHROPIC_API_KEY).
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import ws from "ws";
import { parseOc } from "./parseOc.mjs";
import { extractSubject } from "./extractSubject.mjs";

// claude-opus-4-8 is the most capable model for this OCR/transcription. For bulk
// runs, claude-haiku-4-5 (~$1/$5 per MTok) or claude-sonnet-4-6 (~$3/$15) are
// markedly cheaper and plenty accurate — switch the constant if cost matters.
const MODEL = "claude-haiku-4-5";
const BUCKET = "circulars";

// ---------------------------------------------------------------------------
// Env (same loader as the other scripts)
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
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let limit = null;
  let oc = null;
  let retryFailed = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) limit = parseInt(args[++i], 10);
    else if (args[i] === "--oc" && args[i + 1]) oc = args[++i];
    else if (args[i] === "--retry-failed") retryFailed = true;
    else if (args[i] === "--dry-run") dryRun = true;
  }
  return { limit, oc, retryFailed, dryRun };
}

const { limit, oc, retryFailed, dryRun } = parseArgs();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!dryRun && !ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });
const anthropic = dryRun ? null : new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// OCR via Claude (PDF document block + structured output)
// ---------------------------------------------------------------------------
const OCR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    full_text: {
      type: "string",
      description: "Verbatim transcription of all text in the document, in reading order.",
    },
    doc_reference: {
      type: "string",
      description:
        'The NPCI circular reference number from the document body, e.g. "NPCI/UPI/OC 193A/2024-25". Empty string if none.',
    },
    doc_date: {
      type: "string",
      description: "The document date as ISO YYYY-MM-DD. Empty string if none found.",
    },
    page_count: { type: "integer", description: "Number of pages in the document." },
  },
  required: ["full_text", "doc_reference", "doc_date", "page_count"],
};

async function loadPdfBase64(row) {
  const dl = await supabase.storage.from(BUCKET).download(row.storage_path);
  if (!dl.error && dl.data) {
    return Buffer.from(await dl.data.arrayBuffer()).toString("base64");
  }
  // Fall back to the source URL if the object isn't in storage.
  const res = await fetch(row.source_url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
  });
  if (!res.ok) throw new Error(`fetch PDF: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

function normalizeDate(s) {
  const m = String(s ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function ocrRow(row) {
  const data = await loadPdfBase64(row);
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: OCR_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data },
          },
          {
            type: "text",
            text:
              "Transcribe this scanned NPCI circular verbatim into full_text. " +
              "Extract the circular reference number (doc_reference) and the date " +
              "(doc_date, ISO YYYY-MM-DD) from the document body. Use empty strings if absent.",
          },
        ],
      },
    ],
  });

  if (resp.stop_reason === "refusal") {
    throw new Error(`refusal (${resp.stop_details?.category ?? "unknown"})`);
  }
  if (resp.stop_reason === "max_tokens") {
    throw new Error("max_tokens — transcription truncated");
  }
  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("no text block in response");
  const parsed = JSON.parse(textBlock.text);

  // doc_reference (extracted from the actual PDF body) is far more reliable
  // than file_name for OC-number parsing — file_name is often just a plain
  // title with no "OC" reference at all. Only add oc_number/oc_base when this
  // parse succeeds so a failed/empty doc_reference never nulls out a value
  // already derived from file_name at fetch time.
  const docReference = parsed.doc_reference?.trim() || null;
  const ocFields = parseOc(docReference);
  // Human-readable circular name from the "Subject:" line of the body.
  const ocName = extractSubject(parsed.full_text);

  return {
    content_text: parsed.full_text || null,
    ...(ocName ? { oc_name: ocName } : {}),
    doc_reference: docReference,
    doc_date: normalizeDate(parsed.doc_date),
    page_count: Number.isInteger(parsed.page_count) ? parsed.page_count : null,
    ...(ocFields.oc_number ? { oc_number: ocFields.oc_number, oc_base: ocFields.oc_base } : {}),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let query = supabase
  .from("npci_circulars")
  .select("id, npci_id, oc_number, file_name, storage_path, source_url")
  .order("id", { ascending: true });

if (oc) {
  // Explicit OC: process it regardless of status (re-OCR a specific circular).
  query = query.eq("oc_number", oc);
} else {
  query = query.in("ocr_status", retryFailed ? ["pending", "failed"] : ["pending"]);
}
if (limit) query = query.limit(limit);

const { data: rows, error } = await query;
if (error) {
  console.error(`Failed to load rows: ${error.message}`);
  process.exit(1);
}

console.log(
  `${dryRun ? "[DRY RUN] " : ""}OCR queue: ${rows.length} circular(s)` +
    (dryRun ? "" : ` — model ${MODEL}`),
);

if (dryRun) {
  for (const r of rows) {
    console.log(`  ${String(r.oc_number ?? "—").padEnd(10)} ${r.file_name.slice(0, 70)}`);
  }
  process.exit(0);
}

let done = 0;
let failed = 0;
for (const row of rows) {
  const label = row.oc_number ?? `npci_id ${row.npci_id}`;
  try {
    const fields = await ocrRow(row);
    const { error: upErr } = await supabase
      .from("npci_circulars")
      .update({
        ...fields,
        ocr_status: "done",
        ocr_error: null,
        ocr_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) throw new Error(`db update: ${upErr.message}`);
    done++;
    console.log(`  ✓ ${label} (${fields.content_text?.length ?? 0} chars)`);
  } catch (err) {
    failed++;
    await supabase
      .from("npci_circulars")
      .update({ ocr_status: "failed", ocr_error: err.message, ocr_at: new Date().toISOString() })
      .eq("id", row.id);
    console.error(`  ✗ ${label}: ${err.message}`);
  }
}

console.log(`\nDone: ${done} ocr'd, ${failed} failed.`);
