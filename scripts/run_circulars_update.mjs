/**
 * CI orchestrator for the circulars pipeline (see
 * .github/workflows/ingest-circulars.yml, every-2-days cron):
 * fetch → OCR → summarize → search-corpus rebuild.
 *
 * OCR and summarize only pick up rows still in 'pending', and the corpus
 * rebuild is a cheap full re-upload, so every step runs unconditionally —
 * that also self-heals a previously interrupted run. New circulars are
 * detected by diffing npci_id sets before/after the fetch (exact; no reliance
 * on stdout wording or client-vs-DB clock skew).
 *
 * Usage:
 *   node scripts/run_circulars_update.mjs
 *
 * Needs ANTHROPIC_API_KEY in addition to the Supabase credentials (both read
 * from .env.local with process.env fallback). Same $GITHUB_OUTPUT /
 * $GITHUB_STEP_SUMMARY / issue-body contract as run_monthly_update.mjs:
 *   status=ingested|no_new|failed, new_count, warnings_count, issue_body_path
 */

import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// ---------------------------------------------------------------------------
// Env (same loader as the fetch scripts)
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });

// ---------------------------------------------------------------------------
// CI output helpers (no-ops locally) — same contract as run_monthly_update.mjs
// ---------------------------------------------------------------------------
function ghOutput(pairs) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(pairs)
    .map(([k, v]) => `${k}=${String(v).replace(/\n/g, " ")}`)
    .join("\n");
  appendFileSync(process.env.GITHUB_OUTPUT, lines + "\n");
}

function ghSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
  }
}

function writeIssueBody(markdown) {
  const dir = process.env.RUNNER_TEMP;
  if (!dir) return null;
  const path = join(dir, "circulars_issue_body.md");
  writeFileSync(path, markdown);
  return path;
}

function finish(status, { newCirculars = [], warnings = [] } = {}) {
  const lines = ["## Circulars ingest", "", `**Status:** ${status}`, ""];
  if (newCirculars.length > 0) {
    lines.push(`### ${newCirculars.length} new circular(s)`, "");
    for (const c of newCirculars) {
      lines.push(`- ${c.oc_number ?? "(no OC number)"} — ${c.oc_name ?? c.file_name}`);
    }
    lines.push("");
  }
  if (warnings.length > 0) {
    lines.push(`### ⚠ Warnings (${warnings.length})`, "", "```");
    lines.push(...warnings, "```", "");
  }
  const md = lines.join("\n");

  console.log(
    `\n=== circulars: ${status}` +
      (newCirculars.length ? ` — ${newCirculars.length} new` : "") +
      (warnings.length ? ` — ${warnings.length} warning(s)` : "") +
      " ===",
  );
  for (const w of warnings) console.log(`  ⚠ ${w}`);

  ghSummary(md);
  const issuePath = writeIssueBody(md);
  ghOutput({
    status,
    new_count: newCirculars.length,
    warnings_count: warnings.length,
    ...(issuePath ? { issue_body_path: issuePath } : {}),
  });
  process.exit(status === "failed" ? 1 : 0);
}

function runStep(script, args = []) {
  console.log(`\n── ${script} ${args.join(" ")} ──`);
  const scriptPath = fileURLToPath(new URL(`./${script}`, import.meta.url));
  const child = spawnSync("node", [scriptPath, ...args], { stdio: "inherit" });
  return child.status === 0;
}

async function fetchAllNpciIds() {
  // Full-column-scan of just npci_id (a few hundred rows) — exact new-row
  // detection without trusting stdout wording or client clocks.
  const ids = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("npci_circulars")
      .select("npci_id")
      .order("npci_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`npci_id snapshot failed: ${error.message}`);
    for (const r of data ?? []) ids.add(r.npci_id);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

async function countFailedSince(statusCol, atCol, sinceIso) {
  // Only failures stamped during this run — a permanently broken old row
  // shouldn't re-trigger a notification issue every 2 days.
  const { count, error } = await supabase
    .from("npci_circulars")
    .select("npci_id", { count: "exact", head: true })
    .eq(statusCol, "failed")
    .gte(atCol, sinceIso);
  if (error) throw new Error(`Status count failed for ${statusCol}: ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const warnings = [];

let before;
try {
  before = await fetchAllNpciIds();
} catch (err) {
  console.error(err.message);
  finish("failed", { warnings: [err.message] });
}

// NPCI's circulars API is queried per calendar year; in January the tail of
// the previous year can still receive circulars, so fetch both.
const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
const years = [istNow.getUTCFullYear()];
if (istNow.getUTCMonth() === 0) years.unshift(istNow.getUTCFullYear() - 1);

let failed = false;
for (const year of years) {
  if (!runStep("fetch_npci_circulars.mjs", ["--year", String(year)])) {
    warnings.push(`fetch_npci_circulars.mjs --year ${year} exited non-zero`);
    failed = true;
  }
}

let newCirculars = [];
try {
  const { data, error } = await supabase
    .from("npci_circulars")
    .select("npci_id, oc_number, oc_name, file_name")
    .order("npci_id", { ascending: false })
    .limit(200);
  if (error) throw new Error(`New-circular lookup failed: ${error.message}`);
  newCirculars = (data ?? []).filter((r) => !before.has(r.npci_id));
} catch (err) {
  console.error(err.message);
  warnings.push(err.message);
}

if (newCirculars.length > 0) {
  console.log(`\n${newCirculars.length} new circular(s) detected.`);
}

// OCR/summarize self-select pending rows (no-op when there are none); the
// corpus rebuild must run last so new/updated rows become searchable.
const stepsStartIso = new Date(Date.now() - 60_000).toISOString(); // 1min clock-skew slack
for (const step of [
  "ocr_npci_circulars.mjs",
  "summarize_npci_circulars.mjs",
  "build_circulars_search_corpus.mjs",
]) {
  if (!runStep(step)) {
    warnings.push(`${step} exited non-zero`);
    failed = true;
  }
}

// Per-row OCR/summary failures never abort the scripts — surface them here.
try {
  const ocrFailed = await countFailedSince("ocr_status", "ocr_at", stepsStartIso);
  const summaryFailed = await countFailedSince("summary_status", "summary_at", stepsStartIso);
  if (ocrFailed > 0) warnings.push(`${ocrFailed} circular(s) failed OCR this run`);
  if (summaryFailed > 0)
    warnings.push(`${summaryFailed} circular(s) failed summarization this run`);
} catch (err) {
  warnings.push(err.message);
}

finish(failed ? "failed" : newCirculars.length > 0 ? "ingested" : "no_new", {
  newCirculars,
  warnings,
});
