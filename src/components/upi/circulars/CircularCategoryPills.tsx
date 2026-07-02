// Fixed set from the summarize_npci_circulars.mjs SUMMARY_SCHEMA category enum
// (docs/circular-smart-summary-plan.md) — schema-defined, not data-derived,
// so no query hook is needed.
export const CIRCULAR_CATEGORIES = [
  "limits",
  "mandates/autopay",
  "security/fraud",
  "merchant/P2M",
  "onboarding",
  "technical/API",
  "compliance/penalty",
  "international",
  "product-launch",
  "other",
] as const;

export function CircularCategoryPills({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (category: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-foreground/[0.04] p-1 rounded-full ring-1 ring-black/5 overflow-x-auto sm:flex-wrap sm:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        onClick={() => onSelect(null)}
        className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
          selected === null
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        All categories
      </button>
      {CIRCULAR_CATEGORIES.map((c) => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
            selected === c
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
