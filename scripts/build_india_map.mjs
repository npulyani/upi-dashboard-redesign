/**
 * One-off: builds public/india-states.json (state-level TopoJSON) used by
 * src/components/upi/StateMap.tsx.
 *
 * Source: udit-001/india-maps-data district GeoJSON, pinned to a commit. It
 * draws India's full official boundary (J&K incl. PoK, Ladakh incl.
 * Gilgit-Baltistan and Aksai Chin) and has Telangana and Ladakh as separate
 * features. Districts are dissolved into states on `st_nm`.
 *
 * Usage:
 *   node scripts/build_india_map.mjs
 */

import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/udit-001/india-maps-data/273a91960b2317c8431e562942293de959e2bd68/geojson/india.geojson";
const OUT = "public/india-states.json";

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const src = join(mkdtempSync(join(tmpdir(), "india-map-")), "india.geojson");
writeFileSync(src, Buffer.from(await res.arrayBuffer()));

execFileSync(
  "npx",
  [
    "-y", "mapshaper@0.6", src,
    "-dissolve", "st_nm",
    "-filter-fields", "st_nm",
    "-simplify", "30%", "keep-shapes",
    "-clean",
    "-rename-layers", "states",
    "-o", "format=topojson", "quantization=1e5", OUT,
  ],
  { stdio: "inherit" },
);
