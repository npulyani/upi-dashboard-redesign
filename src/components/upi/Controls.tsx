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
  const idx = useMemo(
    () => AVAILABLE_MONTHS.findIndex((m) => m.year === year && m.month === month),
    [year, month],
  );
  const max = AVAILABLE_MONTHS.length - 1;

  return (
    <div className="flex items-center gap-4 w-full">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
        Jan '21
      </span>
      <div className="relative flex-1 h-6 flex items-center">
        <div className="absolute inset-x-0 h-[2px] bg-foreground/10 rounded-full" />
        <input
          type="range"
          min={0}
          max={max}
          value={idx < 0 ? max : idx}
          onChange={(e) => {
            const m = AVAILABLE_MONTHS[Number(e.target.value)];
            onChange(m.year, m.month);
          }}
          className="relative w-full appearance-none bg-transparent cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:size-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-card
            [&::-webkit-slider-thumb]:ring-2
            [&::-webkit-slider-thumb]:ring-primary
            [&::-webkit-slider-thumb]:shadow-md
            [&::-moz-range-thumb]:appearance-none
            [&::-moz-range-thumb]:size-4
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-card
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-primary"
        />
      </div>
      <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-primary shrink-0 w-20 text-right">
        {month} '{String(year).slice(2)}
      </span>
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
