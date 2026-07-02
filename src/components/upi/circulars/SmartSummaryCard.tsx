import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { Badge } from "@/components/ui/badge";
import { circularRouteKey } from "@/lib/upi/circularsQueryOptions";
import { isFutureDeadline } from "@/lib/upi/circularText";
import { CircularRow } from "@/lib/upi/types";
import { analytics } from "@/lib/analytics";

function formatDate(date: string | null): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Smart-summary card for the circular detail page. Renders nothing until a
 * structured summary exists (see docs/circular-smart-summary-plan.md). */
export function SmartSummaryCard({ circular }: { circular: CircularRow }) {
  const { summary, summary_status: status, summary_model: model } = circular;
  const ocNumber = circularRouteKey(circular);

  useEffect(() => {
    if (status === "done" && summary) analytics.circularSummaryViewed(ocNumber);
  }, [status, summary, ocNumber]);

  if (status !== "done" || !summary) {
    return (
      <BentoCard>
        <CardLabel>Smart summary</CardLabel>
        <span
          title={
            status === "failed"
              ? "Summary generation failed for this circular"
              : "Smart summary is coming soon"
          }
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-foreground/10 text-xs font-medium text-muted-foreground cursor-not-allowed"
        >
          <Sparkles className="size-3.5" />
          {status === "failed" ? "Summary unavailable" : "Summary — coming soon"}
        </span>
      </BentoCard>
    );
  }

  return (
    <BentoCard>
      <CardLabel>Smart summary</CardLabel>
      <p className="mt-2 text-sm sm:text-base leading-relaxed">{summary.tldr}</p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{summary.category}</Badge>
        {summary.audience.map((a) => (
          <Badge key={a} variant="outline">
            {a}
          </Badge>
        ))}
        {summary.effective_date && (
          <Badge variant="outline">Effective from {formatDate(summary.effective_date)}</Badge>
        )}
      </div>

      {summary.action_items.length > 0 && (
        <div className="mt-5">
          <CardLabel>Action items</CardLabel>
          <ul className="mt-2 space-y-2">
            {summary.action_items.map((item, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-2 py-2 px-3 rounded-xl bg-foreground/[0.03]"
              >
                <span className="text-sm flex-1 min-w-[12rem]">{item.action}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {item.owner}
                </span>
                {item.deadline && (
                  <span
                    className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      isFutureDeadline(item.deadline)
                        ? "bg-rose-500/10 text-rose-700"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.deadline}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.references.length > 0 && (
        <div className="mt-5">
          <CardLabel>References</CardLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.references.map((ref) => (
              <Link
                key={ref}
                to="/dashboard/circulars/$ocNumber"
                params={{ ocNumber: encodeURIComponent(ref) }}
                onClick={() => analytics.circularReferenceClicked(ocNumber, ref)}
                className="font-mono text-xs px-2.5 py-1 rounded-full border border-foreground/10 text-primary hover:border-foreground/20 transition-colors"
              >
                {ref}
              </Link>
            ))}
          </div>
        </div>
      )}

      {summary.supersedes_note && (
        <p className="mt-4 text-xs text-muted-foreground">{summary.supersedes_note}</p>
      )}

      <p className="mt-5 text-[11px] text-muted-foreground">
        Summarized by Claude from the circular text — verify against the original PDF.
        {model ? ` (${model})` : ""}
      </p>
    </BentoCard>
  );
}
