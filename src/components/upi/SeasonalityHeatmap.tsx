import { memo, useMemo } from "react";
import { SeasonalityCell } from "@/lib/upi/insights";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function winsorize(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function cellColor(delta: number | null, mom: number | null, lo: number, hi: number): string {
  if (mom === null) return "bg-foreground/5 text-muted-foreground";
  const raw = delta !== null ? delta : mom;
  // Clip outliers to the IQR-derived range before applying colour thresholds
  const v = winsorize(raw, lo, hi);
  const span = Math.max(hi, 1);
  if (v > span * 0.6)  return "bg-emerald-500 text-white";
  if (v > span * 0.3)  return "bg-emerald-400 text-white";
  if (v > span * 0.08) return "bg-emerald-300/80 text-emerald-950";
  if (v > -span * 0.08) return "bg-foreground/8 text-foreground";
  if (v > -span * 0.3)  return "bg-rose-200/80 text-rose-900";
  if (v > -span * 0.6)  return "bg-rose-400 text-white";
  return "bg-rose-600 text-white";
}

export const SeasonalityHeatmap = memo(function SeasonalityHeatmap({ matrix }: { matrix: SeasonalityCell[][] }) {
  const years = useMemo(() => matrix.map((row) => row[0]?.year).filter(Boolean), [matrix]);

  // IQR-based winsorisation bounds — computed once per matrix
  const [wLo, wHi] = useMemo(() => {
    const vals = matrix
      .flatMap((row) => row)
      .map((c) => c.delta_from_avg ?? c.mom)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (vals.length < 4) return [-15, 15];
    const q1 = vals[Math.floor(vals.length * 0.25)];
    const q3 = vals[Math.floor(vals.length * 0.75)];
    const iqr = q3 - q1;
    return [q1 - 1.5 * iqr, q3 + 1.5 * iqr];
  }, [matrix]);

  // Compute per-month averages for the footer
  const monthAvgs = useMemo(() => {
    return MONTH_ABBR.map((_, mi) => {
      const vals = matrix
        .flatMap((row) => row)
        .filter((c) => c.month_num === mi + 1 && c.mom !== null)
        .map((c) => c.mom!);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  }, [matrix]);

  if (!matrix.length) {
    return (
      <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest py-8 text-center">
        Loading seasonality data…
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground w-12 pb-1">
              Year
            </th>
            {MONTH_ABBR.map((m) => (
              <th
                key={m}
                className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground pb-1 min-w-[52px]"
              >
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, yi) => (
            <tr key={years[yi]}>
              <td className="font-mono text-[10px] text-muted-foreground pr-2 py-0.5">
                {years[yi]}
              </td>
              {row.map((cell) => (
                <td key={cell.month_num} className="py-0.5">
                  <div
                    className={`rounded-md text-center py-1.5 px-1 font-mono text-[11px] font-medium tabular-nums transition-colors ${cellColor(cell.delta_from_avg, cell.mom, wLo, wHi)}`}
                    title={
                      cell.mom !== null
                        ? `MoM: ${cell.mom >= 0 ? "+" : ""}${cell.mom.toFixed(1)}%${cell.delta_from_avg !== null ? ` (${cell.delta_from_avg >= 0 ? "+" : ""}${cell.delta_from_avg.toFixed(1)}% vs avg)` : ""}`
                        : "No data"
                    }
                  >
                    {cell.mom !== null
                      ? `${cell.mom >= 0 ? "+" : ""}${cell.mom.toFixed(1)}`
                      : "—"}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground pt-2">
              Avg
            </td>
            {monthAvgs.map((avg, i) => (
              <td key={i} className="pt-2">
                <div className="text-center font-mono text-[10px] text-muted-foreground">
                  {avg !== null ? `${avg >= 0 ? "+" : ""}${avg.toFixed(1)}` : "—"}
                </div>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        Color = deviation from each month's historical average MoM. Green = above avg, Red = below avg.
      </p>
    </div>
  );
});
