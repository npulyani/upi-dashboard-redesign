import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { CircularRow } from "./types";

const HOUR = 60 * 60 * 1000;

export const CIRCULARS_PAGE_SIZE = 20;

// List page: keep the paginated payload small — no content_text (it made
// every page ~90KB+; keyword-search snippets now come from the client-side
// corpus, see circularsSearch.ts) and only the two scoped summary keys the
// row line renders (category badge + action-item deadline chip), not the
// full jsonb.
const CIRCULAR_LIST_COLUMNS =
  "id, npci_id, oc_number, oc_base, oc_name, file_name, doc_reference, doc_date, query_year, ocr_status, storage_path, source_url, created_at, summary_category:summary->>category, summary_action_items:summary->action_items";

// Detail page: single-row fetch, fine to pull the full summary jsonb.
const CIRCULAR_DETAIL_COLUMNS =
  "id, npci_id, oc_number, oc_base, oc_name, file_name, doc_reference, doc_date, query_year, ocr_status, content_text, storage_path, source_url, summary, summary_model, summary_at, summary_status";

export type SearchQuery =
  | { mode: "oc_number"; base: string; full: string | null }
  | { mode: "keyword"; term: string };

// Same separator-class broadening as scripts/parseOc.mjs (scripts/ isn't
// importable from src/ — separate Node/browser build contexts — so this is a
// deliberate duplication, keep the two in sync) so a query like "OC-100" or
// "OC/76" resolves to the same "OC <n><letter?>" shape used to populate
// oc_number/oc_base, instead of silently falling through to a keyword search.
// Requires the whole trimmed input to look like an OC reference — free text
// like "duplicate transaction" falls through to keyword search.
const OC_QUERY_RE = /^(?:oc[\s.\-/]*(?:no\.?)?[\s.\-/]*)?(\d{1,4})[\s-]?([a-z])?$/i;

export function classifySearch(raw: string): SearchQuery | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(OC_QUERY_RE);
  if (m) {
    const base = `OC ${m[1]}`;
    const full = m[2] ? `${base}${m[2].toUpperCase()}` : null;
    return { mode: "oc_number", base, full };
  }
  return { mode: "keyword", term: trimmed };
}

// Addenda are no longer nested/hidden under their parent — every row (primary
// or addendum) is its own top-level list entry, sorted by its own doc_date.
// This lightweight index is the cross-reference: a full-table scan of just
// the columns needed to link a primary <-> its addenda in either direction,
// cached long-lived like circularYearsQuery. Reused as-is on both the list
// page (badges) and the detail page (banner/section) — one query, one cache
// entry, React Query dedupes it.
export interface CircularFamilyMember {
  oc_number: string;
  oc_base: string;
  oc_name: string | null;
  doc_date: string | null;
}

async function fetchCircularFamilyIndex(): Promise<CircularFamilyMember[]> {
  const { data, error } = await supabase
    .from("npci_circulars")
    .select("oc_number, oc_base, oc_name, doc_date")
    .not("oc_number", "is", null)
    .not("oc_base", "is", null);
  if (error) throw error;
  return (data ?? []) as CircularFamilyMember[];
}

export const circularFamilyIndexQuery = () =>
  queryOptions({
    queryKey: ["upi", "circularFamilyIndex"],
    queryFn: fetchCircularFamilyIndex,
    staleTime: 24 * HOUR,
  });

async function fetchCircularsPage({
  pageParam,
  year,
  search,
  category,
}: {
  pageParam: number;
  year: number | null;
  search: SearchQuery | null;
  category: string | null;
}): Promise<CircularRow[]> {
  // Browse + OC-number lookup only. Free-text keyword search never reaches
  // this query — it runs entirely in the browser over the downloaded corpus
  // (circularsSearch.ts / useCircularsSearch).
  let q = supabase
    .from("npci_circulars")
    .select(CIRCULAR_LIST_COLUMNS)
    .order("doc_date", { ascending: false, nullsFirst: false })
    .range(pageParam, pageParam + CIRCULARS_PAGE_SIZE - 1);

  if (year != null) {
    q = q.or(
      `and(doc_date.gte.${year}-01-01,doc_date.lte.${year}-12-31),and(doc_date.is.null,query_year.eq.${year})`,
    );
  }
  if (search?.mode === "oc_number") {
    q = q.eq("oc_base", search.base);
  }
  if (category != null) {
    q = q.eq("summary->>category", category);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CircularRow[];
}

export function circularsInfiniteQuery(
  year: number | null,
  search: SearchQuery | null,
  category: string | null = null,
) {
  return infiniteQueryOptions({
    queryKey: [
      "upi",
      "circulars",
      year ?? "all",
      search?.mode ?? "none",
      search?.mode === "oc_number" ? search.base : (search?.term ?? ""),
      category ?? "all",
    ],
    queryFn: ({ pageParam }) => fetchCircularsPage({ pageParam, year, search, category }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < CIRCULARS_PAGE_SIZE ? undefined : allPages.length * CIRCULARS_PAGE_SIZE,
    staleTime: HOUR,
    gcTime: 24 * HOUR,
  });
}

async function fetchCircularYears(): Promise<number[]> {
  const { data, error } = await supabase.from("npci_circulars").select("doc_date, query_year");
  if (error) throw error;
  const years = new Set<number>();
  for (const r of data ?? []) {
    years.add(r.doc_date ? new Date(r.doc_date).getFullYear() : r.query_year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

export const circularYearsQuery = () =>
  queryOptions({
    queryKey: ["upi", "circularYears"],
    queryFn: fetchCircularYears,
    staleTime: 24 * HOUR,
  });

// Not every row has an oc_number (a handful of general NPCI notices carry no OC
// reference) — those route/link by a synthetic "id-<npci_id>" key instead so
// they're still individually reachable.
export function circularRouteKey(row: Pick<CircularRow, "oc_number" | "id">): string {
  return row.oc_number ?? `id-${row.id}`;
}

async function fetchCircularByKey(key: string): Promise<CircularRow | null> {
  const idMatch = key.match(/^id-(\d+)$/);
  const q = supabase.from("npci_circulars").select(CIRCULAR_DETAIL_COLUMNS);
  const { data, error } = idMatch
    ? await q.eq("id", Number(idMatch[1])).maybeSingle()
    : await q.eq("oc_number", key).maybeSingle();
  if (error) throw error;
  return data as CircularRow | null;
}

export const circularQuery = (key: string) =>
  queryOptions({
    queryKey: ["upi", "circular", key],
    queryFn: () => fetchCircularByKey(key),
    staleTime: HOUR,
  });
