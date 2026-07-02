/**
 * Smart-summary worker for NPCI circulars (see docs/circular-smart-summary-plan.md).
 * Reads the already-OCR'd npci_circulars.content_text and asks Claude for a
 * structured "what this means and what you must do" payload — TL;DR,
 * category, audience, effective date, action items, and cross-references to
 * other circulars — written into npci_circulars.summary.
 *
 * Resumable: only touches rows with ocr_status 'done' and summary_status
 * 'pending' (or 'failed' with --retry-failed). Rows with no usable OCR text
 * are marked 'skipped' rather than sent to the model. Failures are recorded
 * per-row and do not abort the batch.
 *
 * Usage:
 *   node scripts/summarize_npci_circulars.mjs [--limit N] [--oc "OC 193A"] [--retry-failed] [--dry-run]
 *
 * Reads credentials from .env.local (Supabase + ANTHROPIC_API_KEY).
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import ws from "ws";
import { parseOc } from "./parseOc.mjs";

// Structured extraction with judgment calls (deadline vs. date-in-passing,
// what counts as an action item) is worth the step up from Haiku here.
const MODEL = "claude-sonnet-4-6";
const MIN_CONTENT_LENGTH = 200;

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
// Summarization via Claude (structured output)
// ---------------------------------------------------------------------------
const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tldr: {
      type: "string",
      description: "2-3 sentence plain-English summary of what changed and why.",
    },
    category: {
      type: "string",
      enum: [
        "limits",
        "mandates/autopay",
        "security/fraud",
        "merchant/P2M",
        "onboarding",
        "technical/API",
        "compliance/penalty",
        "international",
        "product-launch",
        "other",
      ],
    },
    audience: {
      type: "array",
      items: { type: "string", enum: ["banks", "psps", "tpaps", "merchants", "aggregators"] },
    },
    effective_date: {
      type: "string",
      description: "ISO YYYY-MM-DD the provisions take effect. Empty string if not stated.",
    },
    action_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string" },
          owner: { type: "string" },
          deadline: {
            type: "string",
            description: "Deadline as it literally appears in the source text. Empty string if none.",
          },
        },
        required: ["action", "owner", "deadline"],
      },
    },
    references: {
      type: "array",
      description: 'Other OC numbers explicitly cited in the body, e.g. "OC 141", "OC 97".',
      items: { type: "string" },
    },
    supersedes_note: {
      type: "string",
      description: "Note on what this circular extends/supersedes, if stated. Empty string if none.",
    },
  },
  required: [
    "tldr",
    "category",
    "audience",
    "effective_date",
    "action_items",
    "references",
    "supersedes_note",
  ],
};

function buildPrompt(contentText) {
  return (
    "You are extracting a structured, actionable summary from an official NPCI UPI " +
    "operating circular. The circular's OCR'd text follows.\n\n" +
    "Rules:\n" +
    "- Only state what the circular's text actually says — do not infer or invent " +
    "obligations, deadlines, or audiences that aren't in the text.\n" +
    "- If the circular is purely informational (no action required), return an " +
    "empty action_items array — do not manufacture a task.\n" +
    "- Every \"deadline\" value in action_items must be a date or phrase that " +
    "literally appears in the source text; if no deadline is stated for an " +
    "action, use an empty string.\n" +
    "- \"references\" should list other OC numbers explicitly cited in the body " +
    "(e.g. \"OC 141\", \"OC 97\"), not the circular's own reference number.\n" +
    "- \"effective_date\" is the date the circular's provisions take effect, if " +
    "stated; otherwise an empty string (do not default to the document date).\n\n" +
    "<circular_text>\n" +
    contentText +
    "\n</circular_text>"
  );
}

function nullify(s) {
  const trimmed = String(s ?? "").trim();
  return trimmed ? trimmed : null;
}

async function summarizeRow(row) {
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: SUMMARY_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: buildPrompt(row.content_text) }],
      },
    ],
  });

  if (resp.stop_reason === "refusal") {
    throw new Error(`refusal (${resp.stop_details?.category ?? "unknown"})`);
  }
  if (resp.stop_reason === "max_tokens") {
    throw new Error("max_tokens — summary truncated");
  }
  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("no text block in response");
  const parsed = JSON.parse(textBlock.text);

  // Normalize references through the same OC-parsing rules used to populate
  // oc_number/oc_base, so the UI can link them via oc_base lookups.
  const references = (parsed.references ?? [])
    .map((r) => parseOc(r).oc_number)
    .filter(Boolean);

  const summary = {
    tldr: parsed.tldr,
    category: parsed.category,
    audience: parsed.audience ?? [],
    effective_date: nullify(parsed.effective_date),
    action_items: (parsed.action_items ?? []).map((item) => ({
      action: item.action,
      owner: item.owner,
      deadline: nullify(item.deadline),
    })),
    references,
    supersedes_note: nullify(parsed.supersedes_note),
  };

  return { summary, summary_model: MODEL };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
let query = supabase
  .from("npci_circulars")
  .select("id, npci_id, oc_number, ocr_status, content_text, summary_status")
  .order("id", { ascending: true });

if (oc) {
  // Explicit OC: process it regardless of status (re-summarize a specific circular).
  query = query.eq("oc_number", oc);
} else {
  query = query
    .eq("ocr_status", "done")
    .in("summary_status", retryFailed ? ["pending", "failed"] : ["pending"]);
}
if (limit) query = query.limit(limit);

const { data: rows, error } = await query;
if (error) {
  console.error(`Failed to load rows: ${error.message}`);
  process.exit(1);
}

console.log(
  `${dryRun ? "[DRY RUN] " : ""}Summarize queue: ${rows.length} circular(s)` +
    (dryRun ? "" : ` — model ${MODEL}`),
);

if (dryRun) {
  for (const r of rows) {
    console.log(`  ${String(r.oc_number ?? "—").padEnd(10)} ${r.content_text?.length ?? 0} chars`);
  }
  process.exit(0);
}

let done = 0;
let failed = 0;
let skipped = 0;
for (const row of rows) {
  const label = row.oc_number ?? `npci_id ${row.npci_id}`;

  // The main query already filters ocr_status='done', but the --oc
  // explicit-reprocess path doesn't, so this guard still matters there.
  if (row.ocr_status !== "done" || (row.content_text?.trim().length ?? 0) < MIN_CONTENT_LENGTH) {
    await supabase.from("npci_circulars").update({ summary_status: "skipped" }).eq("id", row.id);
    skipped++;
    console.log(`  · ${label} skipped (no usable OCR text)`);
    continue;
  }

  try {
    const fields = await summarizeRow(row);
    const { error: upErr } = await supabase
      .from("npci_circulars")
      .update({
        ...fields,
        summary_status: "done",
        summary_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) throw new Error(`db update: ${upErr.message}`);
    done++;
    console.log(`  ✓ ${label} (${fields.summary.action_items.length} action item(s))`);
  } catch (err) {
    failed++;
    await supabase
      .from("npci_circulars")
      .update({ summary_status: "failed", summary_at: new Date().toISOString() })
      .eq("id", row.id);
    console.error(`  ✗ ${label}: ${err.message}`);
  }
}

console.log(`\nDone: ${done} summarized, ${skipped} skipped, ${failed} failed.`);
