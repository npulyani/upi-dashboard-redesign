export function CircularYearPills({
  years,
  selected,
  onSelect,
}: {
  years: number[];
  selected: number | null;
  onSelect: (year: number | null) => void;
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
        All years
      </button>
      {years.map((y) => (
        <button
          key={y}
          onClick={() => onSelect(y)}
          className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
            selected === y
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}
