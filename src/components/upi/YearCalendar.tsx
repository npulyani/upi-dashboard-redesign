import { AppMonthData, Metric } from "@/lib/upi/types";
import { generateMonthStory, totalFor, ranked } from "@/lib/upi/insights";
import { formatNumber, formatIndianNumber } from "@/lib/upi/queries";

interface MonthCell {
  year: number;
  month: string;
  month_num: number;
  current: AppMonthData[];
  previous: AppMonthData[];
}

function storySubject(story: string): string {
  if (!story) return "";
  if (story.startsWith("Ecosystem") || story.startsWith("Milestone:")) return "UPI";
  if (story.startsWith("New: ")) {
    const m = story.match(/^New: (.+?) debuted/);
    return m ? m[1] : "New app";
  }
  if (story.includes(" vs ")) return story.split(" (")[0];
  if (story.includes("command")) return story.split("+")[0];
  for (const verb of [" climbed ", " fell ", " surged ", " moved ", " dropped ", " leads "]) {
    const idx = story.indexOf(verb);
    if (idx > 0) return story.slice(0, idx);
  }
  return "";
}

export function YearCalendar({
  cells,
  metric,
  onSelectMonth,
}: {
  cells: MonthCell[];
  metric: Metric;
  onSelectMonth: (year: number, month: string) => void;
}) {
  if (!cells.length) {
    return (
      <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest py-12 text-center">
        Loading…
      </p>
    );
  }

  const maxTotal = Math.max(
    ...cells.map((c) => totalFor(c.current, metric)),
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {cells.map((cell) => {
        const total = totalFor(cell.current, metric);
        const prevTotal = totalFor(cell.previous, metric);
        const mom = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
        const barW = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
        const story = generateMonthStory(cell.month, cell.year, cell.current, cell.previous, metric);
        const subject = storySubject(story) || ranked(cell.current, metric)[0]?.app_name || "";

        return (
          <button
            key={`${cell.year}-${cell.month}`}
            onClick={() => onSelectMonth(cell.year, cell.month)}
            className="group bg-card ring-1 ring-black/5 rounded-2xl p-4 text-left hover:ring-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {cell.month}
              </span>
              {mom !== null && (
                <span
                  className={`font-mono text-[10px] font-semibold ${mom >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {mom >= 0 ? "+" : ""}{mom.toFixed(1)}%
                </span>
              )}
            </div>

            <p className="font-serif text-xl mt-2 leading-tight tabular-nums">
              {metric === "volume"
                ? formatNumber(total * 1e6, 1)
                : `₹${formatIndianNumber(total)} Cr`}
            </p>

            {/* Volume bar */}
            <div className="mt-2 h-1 w-full bg-foreground/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70 transition-all duration-500"
                style={{ width: `${barW}%` }}
              />
            </div>

            {subject && (
              <p className="mt-2 text-[11px] text-muted-foreground truncate">
                {subject}
              </p>
            )}

            {story && (
              <p className="mt-1 text-[10px] text-muted-foreground/70 leading-tight line-clamp-2 group-hover:text-muted-foreground transition-colors">
                {story}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
