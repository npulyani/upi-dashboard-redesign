import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { CircularRow } from "./types";

const HOUR = 60 * 60 * 1000;

export const CIRCULARS_PAGE_SIZE = 20;

// List page: keep the paginated payload small — only the two scoped summary
// keys the row line renders (category badge + action-item deadline chip),
// not the full jsonb.
const CIRCULAR_LIST_COLUMNS =
  "id, npci_id, oc_number, oc_base, oc_name, file_name, doc_reference, doc_date, query_year, ocr_status, content_text, storage_path, source_url, summary_category:summary->>category, summary_action_items:summary->action_items";

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

export interface GroupedCircular {
  key: string;
  parent: CircularRow;
  children: CircularRow[];
  effectiveDate: string | null;
}

/**
 * Groups rows sharing an oc_base (a circular + its addenda) under one parent
 * row. "date" orders groups newest-first (the browse view); "relevance" keeps
 * the incoming row order, which for keyword searches is the server's
 * ts_rank_cd ordering.
 */
export function groupCirculars(
  rows: CircularRow[],
  order: "date" | "relevance" = "date",
): GroupedCircular[] {
  const byBase = new Map<string, CircularRow[]>();
  for (const row of rows) {
    const key = row.oc_base ?? row.oc_number ?? String(row.id);
    const list = byBase.get(key);
    if (list) list.push(row);
    else byBase.set(key, [row]);
  }

  const groups: GroupedCircular[] = Array.from(byBase.entries()).map(([key, group]) => {
    const parent =
      group.find((r) => r.oc_number === r.oc_base) ??
      [...group].sort((a, b) => (a.doc_date ?? "9999-12-31").localeCompare(b.doc_date ?? "9999-12-31"))[0];
    const children = group.filter((r) => r !== parent);
    const effectiveDate = parent.doc_date ?? children.find((c) => c.doc_date)?.doc_date ?? null;
    return { key, parent, children, effectiveDate };
  });

  // Map preserves insertion order, i.e. first appearance in the ranked rows.
  if (order === "relevance") return groups;

  return groups.sort((a, b) => {
    if (!a.effectiveDate && !b.effectiveDate) return 0;
    if (!a.effectiveDate) return 1;
    if (!b.effectiveDate) return -1;
    return b.effectiveDate.localeCompare(a.effectiveDate);
  });
}

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
  // Free-text queries go through the search_circulars RPC (see
  // supabase/migrations/add_circular_oc_name_and_search.sql): relevance-ranked
  // websearch over the content, with an OR fallback so conversational queries
  // ("what are the rules for autopay mandates") still surface the closest
  // circulars instead of AND-ing themselves into zero results.
  if (search?.mode === "keyword") {
    const { data, error } = await supabase.rpc("search_circulars", {
      search_query: search.term,
      filter_year: year,
      page_offset: pageParam,
      page_size: CIRCULARS_PAGE_SIZE,
      filter_category: category,
    });
    if (error) throw error;
    return (data ?? []) as CircularRow[];
  }

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
