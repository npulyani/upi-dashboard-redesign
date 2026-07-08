import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CornerDownRight } from "lucide-react";
import { circularRouteKey } from "@/lib/upi/circularsQueryOptions";
import { CircularFamily } from "@/lib/upi/hooks";
import {
  circularDisplayName,
  deriveSnippet,
  isFutureDeadline,
  isNewCircular,
} from "@/lib/upi/circularText";
import { CircularRow } from "@/lib/upi/types";
import { Badge } from "@/components/ui/badge";

function formatDocDate(docDate: string | null): string {
  if (!docDate) return "Date unknown";
  return new Date(docDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CircularListItem({
  row,
  family,
  highlightTerm,
}: {
  row: CircularRow;
  family: CircularFamily;
  highlightTerm?: string;
}) {
  const navigate = useNavigate();
  const routeKey = circularRouteKey(row);
  const badge = row.oc_number ?? "NPCI notice";
  const title = circularDisplayName(row);
  const snippet = useMemo(
    () => (highlightTerm ? deriveSnippet(row.content_text, highlightTerm) : null),
    [row.content_text, highlightTerm],
  );
  const actionItems = row.summary_action_items ?? [];
  const hasFutureDeadline = actionItems.some((a) => isFutureDeadline(a.deadline));
  const isNew = isNewCircular(row.created_at);

  // Cross-reference, both directions — the family index (not this row's
  // own oc_base/oc_number alone) is what tells us whether this is an
  // addendum or has addenda, since either side may sit far apart in the
  // date-sorted list.
  const isAddendum = !!row.oc_base && row.oc_number !== row.oc_base;
  const parent = isAddendum ? family.byOcNumber.get(row.oc_base!) : undefined;
  const addenda = row.oc_number ? family.addendaByBase.get(row.oc_number) : undefined;

  function open() {
    navigate({
      to: "/dashboard/circulars/$ocNumber",
      params: { ocNumber: encodeURIComponent(routeKey) },
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 py-3 px-3 rounded-xl cursor-pointer transition-colors hover:bg-foreground/[0.04] border-b border-foreground/[0.06] last:border-0"
    >
      <div className="flex items-center justify-between gap-2 sm:contents">
        <span
          className="font-mono text-xs text-primary w-20 flex-shrink-0 truncate sm:mt-0.5"
          title={badge}
        >
          {badge}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0 sm:hidden">
          {isNew && <Badge className="text-[10px]">New</Badge>}
          <span className="font-mono text-xs text-muted-foreground">
            {formatDocDate(row.doc_date)}
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="block text-sm font-medium leading-snug line-clamp-2">{title}</span>
        {isAddendum && (
          <Link
            to="/dashboard/circulars/$ocNumber"
            params={{ ocNumber: encodeURIComponent(row.oc_base!) }}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <CornerDownRight className="size-3" /> Addendum to {row.oc_base}
            {parent?.oc_name ? ` — ${parent.oc_name}` : ""}
          </Link>
        )}
        {addenda && addenda.length > 0 && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CornerDownRight className="size-3" />
            {addenda.length} addend{addenda.length === 1 ? "um" : "a"}:{" "}
            {addenda.map((a, i) => (
              <span key={a.oc_number}>
                {i > 0 && ", "}
                <Link
                  to="/dashboard/circulars/$ocNumber"
                  params={{ ocNumber: encodeURIComponent(a.oc_number) }}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:text-foreground transition-colors underline underline-offset-2"
                >
                  {a.oc_number}
                </Link>
              </span>
            ))}
          </span>
        )}
        {snippet && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {snippet.map((part, i) =>
              part.match ? (
                <mark key={i} className="bg-primary/15 text-foreground rounded-sm px-0.5">
                  {part.text}
                </mark>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </p>
        )}
      </div>
      {(isNew || actionItems.length > 0) && (
        <div className="flex-shrink-0 hidden sm:flex items-center gap-1.5">
          {isNew && <Badge className="text-[10px]">New</Badge>}
          {actionItems.length > 0 && (
            <span
              className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                hasFutureDeadline
                  ? "bg-rose-500/10 text-rose-700"
                  : "bg-foreground/[0.04] text-muted-foreground"
              }`}
            >
              Action required
            </span>
          )}
        </div>
      )}
      <span className="font-mono text-xs text-muted-foreground flex-shrink-0 hidden sm:block mt-0.5">
        {formatDocDate(row.doc_date)}
      </span>
      <Link
        to="/dashboard/circulars/$ocNumber"
        params={{ ocNumber: encodeURIComponent(routeKey) }}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 hidden sm:inline-block px-3 py-1.5 rounded-full border border-foreground/10 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors whitespace-nowrap"
      >
        View details
      </Link>
    </div>
  );
}
