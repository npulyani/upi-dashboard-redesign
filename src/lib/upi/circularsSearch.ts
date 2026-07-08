import { queryOptions } from "@tanstack/react-query";
import MiniSearch from "minisearch";
import { supabase } from "../supabase";
import { CircularRow } from "./types";

const HOUR = 60 * 60 * 1000;

// Client-side circulars search. The whole corpus is small (~240 circulars,
// ~300KB gzipped), so instead of a DB round-trip per query we download it once
// from Storage (built/uploaded by scripts/build_circulars_search_corpus.mjs)
// and search in-memory with MiniSearch — instant per keystroke, nothing to
// hang on. BM25 with OR-combining replaces the old two-tier strict/loose
// tsquery RPC: conversational queries rank docs matching more/rarer terms
// higher instead of AND-ing themselves into zero results.

interface CircularsCorpus {
  generated_at: string;
  rows: CircularRow[];
  /**
   * Prebuilt MiniSearch index, serialized in the build script. When present
   * the browser deserializes it (`loadJSON`, ~20ms) instead of re-tokenizing
   * every circular's `content_text` in `addAll` (~150ms desktop, and seconds
   * on a low-end phone — which froze the main thread and popped Chrome's
   * "page unresponsive"). Falls back to `addAll` if absent (older corpus).
   */
  index?: string;
}

// MUST stay identical to MINISEARCH_OPTIONS in
// scripts/build_circulars_search_corpus.mjs — the serialized index can only be
// loaded with the same field config it was built with. scripts/ and src/ are
// separate build contexts, so this is a deliberate duplication (same pattern
// as parseOc / extractSubject).
const MINISEARCH_OPTIONS = {
  fields: ["oc_name", "content_text", "file_name"],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    combineWith: "OR" as const,
    // The title names what the circular is *about*; weight it over a passing
    // mention deep in some other circular's body.
    boost: { oc_name: 3 },
  },
};

export interface CircularsSearchFilters {
  year: number | null;
}

export interface CircularsSearchEngine {
  search(term: string, filters: CircularsSearchFilters): CircularRow[];
}

function matchesYear(row: CircularRow, year: number | null): boolean {
  if (year == null) return true;
  // Same semantics as the SQL year filter in circularsQueryOptions.ts:
  // doc_date within the year, or undated rows falling back to query_year.
  if (row.doc_date) return row.doc_date >= `${year}-01-01` && row.doc_date <= `${year}-12-31`;
  return row.query_year === year;
}

function buildEngine(corpus: CircularsCorpus): CircularsSearchEngine {
  let mini: MiniSearch<CircularRow>;
  if (corpus.index) {
    // Fast path: deserialize the prebuilt index (no main-thread tokenization).
    mini = MiniSearch.loadJSON<CircularRow>(corpus.index, MINISEARCH_OPTIONS);
  } else {
    // Fallback for an older corpus without a prebuilt index.
    mini = new MiniSearch<CircularRow>(MINISEARCH_OPTIONS);
    mini.addAll(corpus.rows);
  }
  const byId = new Map(corpus.rows.map((r) => [r.id, r]));

  return {
    search(term, { year }) {
      const rows: CircularRow[] = [];
      for (const hit of mini.search(term)) {
        const row = byId.get(hit.id as number);
        if (!row) continue;
        if (!matchesYear(row, year)) continue;
        rows.push(row);
      }
      return rows;
    },
  };
}

async function fetchSearchEngine(): Promise<CircularsSearchEngine> {
  // Fixed path — served max-age=300 and Cloudflare edge-cached (verified via
  // GET; HEAD misreports the header). Fetched once per session (React Query
  // caches the built engine), and the browser cache serves it across reloads.
  const { data } = supabase.storage.from("circulars").getPublicUrl("search/corpus.json");
  const res = await fetch(data.publicUrl);
  if (!res.ok) throw new Error(`Search corpus fetch failed (${res.status})`);
  const corpus = (await res.json()) as CircularsCorpus;
  return buildEngine(corpus);
}

// The built engine is cached as the query data itself, so the index is
// constructed once per session (~tens of ms for 240 docs) and every
// keystroke afterwards is a pure in-memory lookup.
export const circularsSearchEngineQuery = () =>
  queryOptions({
    queryKey: ["upi", "circularsSearchEngine"],
    queryFn: fetchSearchEngine,
    staleTime: HOUR,
    gcTime: 24 * HOUR,
  });
