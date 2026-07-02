import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { circularRouteKey, GroupedCircular } from "@/lib/upi/circularsQueryOptions";
import { circularDisplayName, deriveSnippet } from "@/lib/upi/circularText";
import { CircularRow } from "@/lib/upi/types";

function formatDocDate(docDate: string | null): string {
  if (!docDate) return "Date unknown";
  return new Date(docDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CircularRowLine({
  row,
  indent,
  highlightTerm,
}: {
  row: CircularRow;
  indent?: boolean;
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
      className={`flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 py-3 px-3 rounded-xl cursor-pointer transition-colors hover:bg-foreground/[0.04] ${
        indent ? "ml-6 border-l border-foreground/10 pl-4" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 sm:contents">
        <span
          className="font-mono text-xs text-primary w-20 flex-shrink-0 truncate sm:mt-0.5"
          title={badge}
        >
          {badge}
        </span>
        <span className="font-mono text-xs text-muted-foreground flex-shrink-0 sm:hidden">
          {formatDocDate(row.doc_date)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="block text-sm font-medium leading-snug line-clamp-2">{title}</span>
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

export function CircularListItem({
  group,
  expanded,
  onToggleExpand,
  highlightTerm,
}: {
  group: GroupedCircular;
  expanded: boolean;
  onToggleExpand: () => void;
  highlightTerm?: string;
}) {
  const hasChildren = group.children.length > 0;

  return (
    <div className="border-b border-foreground/[0.06] last:border-0">
      <div className="flex items-start">
        {hasChildren ? (
          <button
            onClick={onToggleExpand}
            aria-label={expanded ? "Collapse addenda" : "Expand addenda"}
            className="flex-shrink-0 p-1.5 mt-2.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="w-7 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <CircularRowLine row={group.parent} highlightTerm={highlightTerm} />
        </div>
        {hasChildren && (
          <span className="flex-shrink-0 mr-3 mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            +{group.children.length} addenda
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="pb-2">
          {group.children.map((child) => (
            <CircularRowLine key={child.id} row={child} indent highlightTerm={highlightTerm} />
          ))}
        </div>
      )}
    </div>
  );
}
