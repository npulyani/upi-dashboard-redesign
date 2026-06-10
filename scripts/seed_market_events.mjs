/**
 * Seeds market_events with curated UPI ecosystem events (regulatory, corporate,
 * product, policy). Source of truth: src/lib/upi/market-events.json — edit that
 * file, then re-run this script.
 *
 * Usage:
 *   node scripts/seed_market_events.mjs
 *
 * Reads credentials from .env.local (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY or
 * SUPABASE_SERVICE_ROLE_KEY). The table must exist (run add_market_events.sql first).
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// ---------------------------------------------------------------------------
// Load .env.local
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
    // ignore — fall through to process.env
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } });

const EVENTS = JSON.parse(
  readFileSync(new URL("../src/lib/upi/market-events.json", import.meta.url), "utf8"),
);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding ${EVENTS.length} market events…`);

  const { error } = await supabase
    .from("market_events")
    .upsert(EVENTS, { onConflict: "event_date,title" });

  if (error) {
    console.error("Error seeding market events:", error.message);
    process.exit(1);
  }

  console.log("Done. Verifying…");
  const { data, error: verifyErr } = await supabase
    .from("market_events")
    .select("event_date, title, category")
    .order("event_date", { ascending: true });

  if (verifyErr) {
    console.error("Verification failed:", verifyErr.message);
    process.exit(1);
  }

  console.log(`\nEvents in table:`);
  data.forEach((r) => console.log(`  ${r.event_date} [${r.category}] ${r.title}`));
  console.log(`\nTotal rows: ${data.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
