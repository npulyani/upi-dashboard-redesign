import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { CircularSearchBox } from "@/components/upi/circulars/CircularSearchBox";
import { CircularYearPills } from "@/components/upi/circulars/CircularYearPills";
import { CircularCategoryPills } from "@/components/upi/circulars/CircularCategoryPills";
import { CircularListItem } from "@/components/upi/circulars/CircularListItem";
import { useCircularsInfinite, useCircularYears } from "@/lib/upi/hooks";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { classifySearch, groupCirculars } from "@/lib/upi/circularsQueryOptions";
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

function CircularsPage() {
  const [rawSearch, setRawSearch] = useState("");
  const debouncedSearch = useDebouncedValue(rawSearch, 350);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const searchQuery = useMemo(() => classifySearch(debouncedSearch), [debouncedSearch]);
  const years = useCircularYears();
  const { rows, isPending, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useCircularsInfinite(selectedYear, searchQuery, selectedCategory);
  const isKeywordSearch = searchQuery?.mode === "keyword";
  const groups = useMemo(
    () => groupCirculars(rows, isKeywordSearch ? "relevance" : "date"),
    [rows, isKeywordSearch],
  );

  useEffect(() => {
    analytics.circularsPageViewed();
  }, []);

  useEffect(() => {
    if (debouncedSearch && searchQuery) {
      analytics.circularSearchPerformed(searchQuery.mode, debouncedSearch);
    }
  }, [debouncedSearch, searchQuery]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  function handleYearSelect(year: number | null) {
    analytics.circularYearFilterChanged(year);
    setSelectedYear(year);
  }

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

      {/* Hidden for now — search has a known issue, re-enable once fixed. */}
      {/* <CircularSearchBox value={rawSearch} onChange={setRawSearch} /> */}

      <CircularYearPills years={years} selected={selectedYear} onSelect={handleYearSelect} />

      <CircularCategoryPills selected={selectedCategory} onSelect={setSelectedCategory} />

      <BentoCard className="!p-0 overflow-hidden">
        {isPending && groups.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground font-mono text-xs uppercase tracking-widest">
            Loading…
          </div>
        ) : isError ? (
          <div className="p-8">
            <h3 className="font-serif text-2xl">Couldn&apos;t load circulars</h3>
            <p className="mt-2 text-sm text-muted-foreground font-mono">
              {(error as { message?: string } | null)?.message ?? "Unknown error"}
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="p-8">
            <h3 className="font-serif text-2xl">No circulars found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different OC number, keyword, or year filter.
            </p>
          </div>
        ) : (
          <div className="p-3">
            {groups.map((group) => (
              <CircularListItem
                key={group.key}
                group={group}
                expanded={expandedKeys.has(group.key)}
                onToggleExpand={() => toggleExpand(group.key)}
                highlightTerm={isKeywordSearch ? searchQuery.term : undefined}
              />
            ))}
          </div>
        )}
      </BentoCard>

      <div ref={sentinelRef} className="h-10 flex items-center justify-center">
        {isFetchingNextPage && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Loading more…
          </span>
        )}
      </div>
    </div>
  );
}
