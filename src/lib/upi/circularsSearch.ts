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
}

export interface CircularsSearchFilters {
  year: number | null;
  category: string | null;
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
  const mini = new MiniSearch<CircularRow>({
    fields: ["oc_name", "content_text", "file_name"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      combineWith: "OR",
      // The title names what the circular is *about*; weight it over a
      // passing mention deep in some other circular's body.
      boost: { oc_name: 3 },
    },
  });
  mini.addAll(corpus.rows);
  const byId = new Map(corpus.rows.map((r) => [r.id, r]));

  return {
    search(term, { year, category }) {
      const rows: CircularRow[] = [];
      for (const hit of mini.search(term)) {
        const row = byId.get(hit.id as number);
        if (!row) continue;
        if (!matchesYear(row, year)) continue;
        if (category != null && row.summary_category !== category) continue;
        rows.push(row);
      }
      return rows;
    },
  };
}

interface CorpusManifest {
  path: string;
  generated_at: string;
}

function publicUrl(path: string): string {
  return supabase.storage.from("circulars").getPublicUrl(path).data.publicUrl;
}

// Resolve the current corpus path via the manifest. The hashed corpus file is
// immutable + long-cached (edge- and browser-cached), so it's fetched once and
// never re-downloaded; the manifest is tiny and effectively uncached so a newly
// built corpus is picked up immediately. Falls back to the legacy fixed path if
// the manifest isn't present yet (e.g. before the next corpus rebuild).
async function resolveCorpusPath(): Promise<string> {
  try {
    const res = await fetch(publicUrl("search/corpus-manifest.json"));
    if (res.ok) {
      const manifest = (await res.json()) as CorpusManifest;
      if (manifest?.path) return manifest.path;
    }
  } catch {
    // fall through to legacy path
  }
  return "search/corpus.json";
}

async function fetchSearchEngine(): Promise<CircularsSearchEngine> {
  const path = await resolveCorpusPath();
  const res = await fetch(publicUrl(path));
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
