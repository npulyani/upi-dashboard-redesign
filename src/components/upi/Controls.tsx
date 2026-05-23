import { useMemo } from "react";
import { AVAILABLE_MONTHS } from "@/lib/upi/queries";

export function MonthScrubber({
  year,
  month,
  onChange,
}: {
  year: number;
  month: string;
  onChange: (y: number, m: string) => void;
}) {
  const years = useMemo(
    () => Array.from(new Set(AVAILABLE_MONTHS.map((m) => m.year))),
    [],
  );

  const monthsForYear = useMemo(
    () => AVAILABLE_MONTHS.filter((m) => m.year === year),
    [year],
  );

  return (
    <div className="flex items-center gap-3">
      <select
        value={year}
        onChange={(e) => {
          const newYear = Number(e.target.value);
          const available = AVAILABLE_MONTHS.filter((m) => m.year === newYear);
          const newMonth = available.find((m) => m.month === month)
            ? month
            : available[available.length - 1]?.month ?? month;
          onChange(newYear, newMonth);
        }}
        className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onChange(year, e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {monthsForYear.map((m) => (
          <option key={m.month} value={m.month}>
            {m.month}
          </option>
        ))}
      </select>
    </div>
  );
}


export function MetricToggle({
  metric,
  onChange,
}: {
  metric: "volume" | "value";
  onChange: (m: "volume" | "value") => void;
}) {
  return (
    <div className="inline-flex items-center bg-foreground/[0.04] p-1 rounded-full ring-1 ring-black/5">
      {(["volume", "value"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all ${
            metric === m
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {m === "volume" ? "Volume" : "Value"}
        </button>
      ))}
    </div>
  );
}
