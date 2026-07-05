/**
 * CI orchestrator for the monthly NPCI data update (see
 * .github/workflows/ingest-monthly.yml). Runs on a 1st/11th/21st cron:
 * computes the month that should exist by now (previous calendar month, IST),
 * checks which datasets already have it, probes NPCI, and runs only the
 * missing single-month fetch scripts. Exits 0 quietly when everything is
 * already ingested or NPCI hasn't published yet — that quiet exit is what
 * makes the every-10-days schedule converge without any state file.
 *
 * Usage:
 *   node scripts/run_monthly_update.mjs [--year 2026 --month Jun]
 *
 * Args override the computed month (backfills, NPCI revisions — re-runs are
 * safe, every fetch script upserts). Reads credentials from .env.local with
 * process.env fallback like its siblings.
 *
 * Contract with the workflow (all optional locally):
 *   $GITHUB_OUTPUT       status=ingested|already_done|not_published|failed,
 *                        month_label, warnings_count, ingested_datasets,
 *                        pending_datasets, issue_body_path
 *   $GITHUB_STEP_SUMMARY Markdown run summary
 *   $RUNNER_TEMP/monthly_issue_body.md  body for the notification issue
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
// Args / expected month
// ---------------------------------------------------------------------------
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parseArgs() {
  const args = process.argv.slice(2);
  let year = null;
  let month = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) year = parseInt(args[++i], 10);
    else if (args[i] === "--month" && args[i + 1]) month = args[++i];
  }
  if ((year == null) !== (month == null)) {
    console.error("Pass --year and --month together, or neither.");
    process.exit(1);
  }
  if (year == null) {
    // Previous calendar month in IST — NPCI publishes month M during M+1.
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    let y = ist.getUTCFullYear();
    let m = ist.getUTCMonth(); // 0-based; as a 1-based month this IS the previous month
    if (m === 0) {
      y -= 1;
      m = 12;
    }
    return { year: y, month: MONTH_ABBR[m - 1], month_num: m };
  }
  const month_num = MONTH_ABBR.indexOf(month) + 1;
  if (month_num === 0) {
    console.error(`Unknown month: "${month}". Use 3-letter abbreviation (Jan, Feb, … Dec).`);
    process.exit(1);
  }
  return { year, month, month_num };
}

const { year, month, month_num } = parseArgs();
const monthLabel = `${month} ${year}`;

// ---------------------------------------------------------------------------
// Datasets, in dependency order: upi_apps feeds upi_monthly_data (which
// p2p_p2m cross-references), and mcc reconciles against upi_p2p_p2m.
// ---------------------------------------------------------------------------
const DATASETS = [
  { name: "upi_apps", script: "fetch_upi_apps.mjs", table: "upi_monthly_data" },
  { name: "p2p_p2m", script: "fetch_p2p_p2m.mjs", table: "upi_p2p_p2m" },
  { name: "mcc", script: "fetch_mcc.mjs", table: "upi_mcc_data" },
  { name: "statewise", script: "fetch_statewise.mjs", table: "upi_statewise_data" },
];

async function hasMonth(table) {
  const { count, error } = await supabase
    .from(table)
    .select("year", { count: "exact", head: true })
    .eq("year", year)
    .eq("month_num", month_num);
  if (error) throw new Error(`Presence check failed for ${table}: ${error.message}`);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// NPCI probe (same endpoint/UA as fetch_p2p_p2m.mjs)
// ---------------------------------------------------------------------------
async function npciHasMonth() {
  const url =
    "https://www.npci.org.in/api/ecosystem-statistics/get-statistics" +
    `?product_name=UPI&tab_name=p2p-and-p2m-transactions` +
    `&year=${year}&month=${month}&page_no=1&sort_by=asc&size=10&locale=en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; data-ingest-script)" },
  });
  if (!res.ok) throw new Error(`NPCI probe HTTP ${res.status}`);
  const json = await res.json();
  const results = json?.data?.results;
  return Array.isArray(results) && results.length > 0;
}

// ---------------------------------------------------------------------------
// CI output helpers (no-ops locally)
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
  const path = join(dir, "monthly_issue_body.md");
  writeFileSync(path, markdown);
  return path;
}

function finish(status, { results = [], warnings = [] } = {}) {
  const ingested = results.filter((r) => r.outcome === "ingested").map((r) => r.name);
  const pending = results.filter((r) => r.outcome === "pending").map((r) => r.name);

  const lines = [`## Monthly ingest — ${monthLabel}`, "", `**Status:** ${status}`, ""];
  if (results.length > 0) {
    lines.push("| Dataset | Result |", "| --- | --- |");
    for (const r of results) lines.push(`| ${r.name} | ${r.outcome} |`);
    lines.push("");
  }
  if (warnings.length > 0) {
    lines.push(`### ⚠ Validation warnings (${warnings.length})`, "", "```");
    lines.push(...warnings, "```", "");
  }
  const md = lines.join("\n");

  console.log(`\n=== ${monthLabel}: ${status}` +
    (ingested.length ? ` — ingested: ${ingested.join(", ")}` : "") +
    (pending.length ? ` — still unpublished: ${pending.join(", ")}` : "") +
    (warnings.length ? ` — ${warnings.length} warning(s)` : "") + " ===");
  for (const w of warnings) console.log(`  ⚠ ${w}`);

  ghSummary(md);
  const issuePath = writeIssueBody(md);
  ghOutput({
    status,
    month_label: monthLabel,
    warnings_count: warnings.length,
    ingested_datasets: ingested.join(","),
    pending_datasets: pending.join(","),
    ...(issuePath ? { issue_body_path: issuePath } : {}),
  });
  process.exit(status === "failed" ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`Monthly update check for ${monthLabel} …`);

let missing;
try {
  const presence = await Promise.all(DATASETS.map((d) => hasMonth(d.table)));
  missing = DATASETS.filter((_, i) => !presence[i]);
} catch (err) {
  console.error(err.message);
  finish("failed", { warnings: [err.message] });
}

if (missing.length === 0) {
  console.log(`All datasets already have ${monthLabel} — nothing to do.`);
  finish("already_done");
}
console.log(`Missing datasets: ${missing.map((d) => d.name).join(", ")}`);

try {
  if (!(await npciHasMonth())) {
    console.log(`NPCI has not published ${monthLabel} yet — will retry next scheduled run.`);
    finish("not_published");
  }
} catch (err) {
  console.error(err.message);
  finish("failed", { warnings: [err.message] });
}

const results = [];
const warnings = [];
let failed = false;

for (const dataset of missing) {
  console.log(`\n── ${dataset.name} (${dataset.script}) ──`);
  const scriptPath = fileURLToPath(new URL(`./${dataset.script}`, import.meta.url));
  const child = spawnSync(
    "node",
    [scriptPath, "--year", String(year), "--month", month],
    { encoding: "utf8" },
  );
  const stdout = child.stdout ?? "";
  const stderr = child.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  // Only ⚠-flagged lines are warnings; informational notes ("skipped"
  // cross-refs, tab-not-published-yet) are not. Scripts warn via console.warn,
  // so scan stderr too.
  const combined = `${stdout}\n${stderr}`;
  for (const line of combined.split("\n")) {
    if (line.includes("⚠") && !line.includes("No data returned")) {
      warnings.push(`[${dataset.name}] ${line.trim()}`);
    }
  }

  if (child.status !== 0) {
    results.push({ name: dataset.name, outcome: "failed" });
    warnings.push(`[${dataset.name}] exited with code ${child.status}`);
    failed = true;
  } else if (combined.includes("No data returned")) {
    // This tab isn't published yet (NPCI staggers tabs) — benign, retry later.
    results.push({ name: dataset.name, outcome: "pending" });
  } else {
    results.push({ name: dataset.name, outcome: "ingested" });
  }
}

for (const d of DATASETS) {
  if (!missing.includes(d)) results.push({ name: d.name, outcome: "already_present" });
}

const anyIngested = results.some((r) => r.outcome === "ingested");
finish(failed ? "failed" : anyIngested ? "ingested" : "not_published", { results, warnings });
