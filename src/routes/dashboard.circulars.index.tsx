import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { CircularSearchBox } from "@/components/upi/circulars/CircularSearchBox";
import { CircularYearPills } from "@/components/upi/circulars/CircularYearPills";
import { CircularCategoryPills } from "@/components/upi/circulars/CircularCategoryPills";
import { CircularListItem } from "@/components/upi/circulars/CircularListItem";
import {
  useCircularFamily,
  useCircularsInfinite,
  useCircularsSearch,
  useCircularYears,
} from "@/lib/upi/hooks";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { classifySearch } from "@/lib/upi/circularsQueryOptions";
import { analytics } from "@/lib/analytics";

export const Route = createFileRoute("/dashboard/circulars/")({
  head: () => ({
    meta: [
      { title: "Circulars — State of UPI" },
      {
        name: "description",
        content: "Search and browse official NPCI UPI operating circulars.",
      },
    ],
  }),
  component: CircularsPage,
});

// Keyword results are fully local, so "pagination" is just a render cap that
// the scroll sentinel bumps.
const SEARCH_RENDER_CHUNK = 50;

function CircularsPage() {
  const [rawSearch, setRawSearch] = useState("");
  // Keyword search is an in-memory index lookup — the short debounce only
  // smooths render churn, there's no network round-trip behind it.
  const debouncedSearch = useDebouncedValue(rawSearch, 120);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // Flips true on first focus of the search box, prefetching the corpus so
  // the index is usually ready by the first keystroke.
  const [searchIntent, setSearchIntent] = useState(false);

  const searchQuery = useMemo(() => classifySearch(debouncedSearch), [debouncedSearch]);
  const isKeywordSearch = searchQuery?.mode === "keyword";
  const years = useCircularYears();
  const family = useCircularFamily();

  // Browse + OC-number lookup stay on the paginated DB query; keyword mode
  // pauses it and searches the client-side corpus instead.
  const dbSearch = searchQuery?.mode === "oc_number" ? searchQuery : null;
  const db = useCircularsInfinite(selectedYear, dbSearch, selectedCategory, !isKeywordSearch);
  const local = useCircularsSearch(
    isKeywordSearch ? searchQuery.term : "",
    selectedYear,
    selectedCategory,
    searchIntent || isKeywordSearch,
  );

  // Every row (primary or addendum) is its own list entry, already sorted —
  // doc_date-desc from the DB for browse, BM25 relevance for keyword search.
  const rows = isKeywordSearch ? local.rows : db.rows;

  const [visibleCount, setVisibleCount] = useState(SEARCH_RENDER_CHUNK);
  useEffect(() => {
    setVisibleCount(SEARCH_RENDER_CHUNK);
  }, [debouncedSearch, selectedYear, selectedCategory]);
  const visibleRows = isKeywordSearch ? rows.slice(0, visibleCount) : rows;

  const isPending = isKeywordSearch ? local.isLoadingEngine : db.isPending;
  const isError = isKeywordSearch ? local.isError : db.isError;
  const errorMessage = isKeywordSearch
    ? "Search is unavailable right now — try again in a moment."
    : ((db.error as { message?: string } | null)?.message ?? "Unknown error");
  const hasMore = isKeywordSearch ? rows.length > visibleCount : db.hasNextPage;

  useEffect(() => {
    analytics.circularsPageViewed();
  }, []);

  useEffect(() => {
    if (debouncedSearch && searchQuery) {
      analytics.circularSearchPerformed(searchQuery.mode, debouncedSearch);
    }
  }, [debouncedSearch, searchQuery]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { fetchNextPage, isFetchingNextPage } = db;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || !hasMore) return;
        if (isKeywordSearch) setVisibleCount((c) => c + SEARCH_RENDER_CHUNK);
        else if (!isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isKeywordSearch, isFetchingNextPage, fetchNextPage]);

  function handleYearSelect(year: number | null) {
    analytics.circularYearFilterChanged(year);
    setSelectedYear(year);
  }

  return (
    <div className="space-y-5">
      <div>
        <CardLabel>NPCI · Official circulars</CardLabel>
        <h1 className="font-serif text-3xl lg:text-4xl mt-1">Circulars</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Every official NPCI UPI circular, as published on{" "}
          <a
            href="https://www.npci.org.in/circulars/upi"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            npci.org.in/circulars/upi
          </a>
          .
        </p>
      </div>

      <CircularSearchBox
        value={rawSearch}
        onChange={setRawSearch}
        onFocus={() => setSearchIntent(true)}
      />

      <CircularYearPills years={years} selected={selectedYear} onSelect={handleYearSelect} />

      <CircularCategoryPills selected={selectedCategory} onSelect={setSelectedCategory} />

      <BentoCard className="!p-0 overflow-hidden">
        {isPending && rows.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground font-mono text-xs uppercase tracking-widest">
            {isKeywordSearch ? "Loading search…" : "Loading…"}
          </div>
        ) : isError ? (
          <div className="p-8">
            <h3 className="font-serif text-2xl">
              {isKeywordSearch ? "Couldn’t search circulars" : "Couldn’t load circulars"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground font-mono">{errorMessage}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <h3 className="font-serif text-2xl">No circulars found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different OC number, keyword, or year filter.
            </p>
          </div>
        ) : (
          <div className="p-3">
            {visibleRows.map((row) => (
              <CircularListItem
                key={row.id}
                row={row}
                family={family}
                highlightTerm={isKeywordSearch ? searchQuery.term : undefined}
              />
            ))}
          </div>
        )}
      </BentoCard>

      <div ref={sentinelRef} className="h-10 flex items-center justify-center">
        {!isKeywordSearch && isFetchingNextPage && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Loading more…
          </span>
        )}
      </div>
    </div>
  );
}
