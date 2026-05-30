/**
 * Seeds upi_state_population with 2021 projected population for all Indian states/UTs.
 * Population figures are in millions (matching volume_in_mn units in upi_statewise_data).
 *
 * Source: Census 2011 projected to 2021 via SRS / Niti Aayog estimates.
 *
 * Usage:
 *   node scripts/seed_population.mjs
 *
 * Reads credentials from .env.local (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY or
 * SUPABASE_SERVICE_ROLE_KEY). The table must exist (run add_state_population.sql first).
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

// ---------------------------------------------------------------------------
// Population data — NPCI state_union_territory names → 2021 projected population (mn)
// ---------------------------------------------------------------------------
const POPULATION_DATA = [
  // Large states
  { state_union_territory: "UTTAR PRADESH",     population_mn: 235.69 },
  { state_union_territory: "MAHARASHTRA",        population_mn: 126.39 },
  { state_union_territory: "BIHAR",              population_mn: 128.50 },
  { state_union_territory: "WEST BENGAL",        population_mn: 100.93 },
  { state_union_territory: "MADHYA PRADESH",     population_mn: 87.00  },
  { state_union_territory: "RAJASTHAN",          population_mn: 81.03  },
  { state_union_territory: "TAMIL NADU",         population_mn: 78.80  },
  { state_union_territory: "GUJARAT",            population_mn: 70.49  },
  { state_union_territory: "KARNATAKA",          population_mn: 67.56  },
  { state_union_territory: "ANDHRA PRADESH",     population_mn: 53.90  },
  { state_union_territory: "ODISHA",             population_mn: 46.36  },
  { state_union_territory: "JHARKHAND",          population_mn: 39.10  },
  { state_union_territory: "TELANGANA",          population_mn: 38.50  },
  { state_union_territory: "KERALA",             population_mn: 36.03  },
  { state_union_territory: "ASSAM",              population_mn: 34.38  },
  { state_union_territory: "DELHI",              population_mn: 32.94  },
  { state_union_territory: "PUNJAB",             population_mn: 31.15  },
  { state_union_territory: "HARYANA",            population_mn: 29.34  },
  { state_union_territory: "CHHATTISGARH",       population_mn: 29.72  },
  { state_union_territory: "UTTARAKHAND",        population_mn: 11.52  },
  { state_union_territory: "HIMACHAL PRADESH",   population_mn: 7.30   },
  { state_union_territory: "JAMMU AND KASHMIR",  population_mn: 14.00  },
  { state_union_territory: "LADAKH",             population_mn: 0.30   },
  { state_union_territory: "TRIPURA",            population_mn: 4.32   },
  { state_union_territory: "MEGHALAYA",          population_mn: 3.56   },
  { state_union_territory: "MANIPUR",            population_mn: 3.22   },
  { state_union_territory: "NAGALAND",           population_mn: 2.19   },
  { state_union_territory: "ARUNACHAL PRADESH",  population_mn: 1.68   },
  { state_union_territory: "GOA",                population_mn: 1.59   },
  { state_union_territory: "MIZORAM",            population_mn: 1.29   },
  { state_union_territory: "CHANDIGARH",         population_mn: 1.16   },
  { state_union_territory: "PUDUCHERRY",         population_mn: 1.73   },
  { state_union_territory: "SIKKIM",             population_mn: 0.68   },
  { state_union_territory: "ANDAMAN & NICOBAR",  population_mn: 0.42   },
  { state_union_territory: "DADRA & NAGAR HAVELI & DAMAN & DIU", population_mn: 0.59 },
  { state_union_territory: "LAKSHADWEEP",        population_mn: 0.07   },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding ${POPULATION_DATA.length} state population records…`);

  const { error } = await supabase
    .from("upi_state_population")
    .upsert(POPULATION_DATA, { onConflict: "state_union_territory" });

  if (error) {
    console.error("Error seeding population data:", error.message);
    process.exit(1);
  }

  console.log("Done. Verifying…");
  const { data, error: verifyErr } = await supabase
    .from("upi_state_population")
    .select("state_union_territory, population_mn")
    .order("population_mn", { ascending: false });

  if (verifyErr) {
    console.error("Verification failed:", verifyErr.message);
    process.exit(1);
  }

  console.log(`\nTop 5 by population:`);
  data.slice(0, 5).forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.state_union_territory}: ${r.population_mn} mn`),
  );
  console.log(`\nTotal rows: ${data.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
