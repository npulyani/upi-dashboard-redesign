import { useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CornerDownRight, FileText } from "lucide-react";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { CircularTextView } from "@/components/upi/circulars/CircularTextView";
import { SmartSummaryCard } from "@/components/upi/circulars/SmartSummaryCard";
import { useCircular, useCircularFamily } from "@/lib/upi/hooks";
import { circularDisplayName } from "@/lib/upi/circularText";
import { supabase } from "@/lib/supabase";
import { analytics } from "@/lib/analytics";

export const Route = createFileRoute("/dashboard/circulars/$ocNumber")({
  head: ({ params }) => ({
    meta: [{ title: `${decodeURIComponent(params.ocNumber)} — Circulars — State of UPI` }],
  }),
  component: CircularDetailPage,
});

function formatDocDate(docDate: string | null): string {
  if (!docDate) return "Date unknown";
  return new Date(docDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function CircularDetailPage() {
  const { ocNumber } = Route.useParams();
  const decoded = decodeURIComponent(ocNumber);
  const { circular, isPending } = useCircular(decoded);
  const family = useCircularFamily();

  useEffect(() => {
    analytics.circularOpened(decoded);
  }, [decoded]);

  // Prefer the circular's original NPCI URL; the storage mirror is a fallback
  // for the few rows whose source link has rotted.
  const pdfUrl = useMemo(() => {
    if (circular?.source_url) return circular.source_url;
    if (!circular?.storage_path) return null;
    return supabase.storage.from("circulars").getPublicUrl(circular.storage_path).data.publicUrl;
  }, [circular]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground font-mono text-xs uppercase tracking-widest">
        Loading…
      </div>
    );
  }

  if (!circular) {
    return (
      <div className="space-y-5">
        <BackLink />
        <BentoCard>
          <CardLabel>Circulars</CardLabel>
          <h3 className="font-serif text-2xl mt-1">Circular not found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t find a circular with reference &quot;{decoded}&quot;.
          </p>
        </BentoCard>
      </div>
    );
  }

  const title = circularDisplayName(circular);
  const hasContent = circular.ocr_status === "done" && !!circular.content_text;

  // Cross-reference, both directions — every circular (including addenda) is
  // its own top-level list entry now, so this is the only place the
  // parent/addenda relationship still shows.
  const isAddendum = !!circular.oc_base && circular.oc_number !== circular.oc_base;
  const parent = isAddendum ? family.byOcNumber.get(circular.oc_base!) : undefined;
  const addenda = circular.oc_number ? family.addendaByBase.get(circular.oc_number) : undefined;

  return (
    <div className="space-y-5">
      <BackLink />

      <BentoCard>
        <CardLabel>{circular.oc_number ?? circular.file_name}</CardLabel>
        <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl mt-1">{title}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {formatDocDate(circular.doc_date)}
          {circular.doc_reference ? ` · Ref ${circular.doc_reference}` : ""}
        </p>
        {isAddendum && (
          <Link
            to="/dashboard/circulars/$ocNumber"
            params={{ ocNumber: encodeURIComponent(circular.oc_base!) }}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <CornerDownRight className="size-3.5" /> Addendum to {circular.oc_base}
            {parent?.oc_name ? ` — ${parent.oc_name}` : ""}
          </Link>
        )}
        {addenda && addenda.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <CornerDownRight className="size-3.5 flex-shrink-0" />
            <span>
              {addenda.length} addend{addenda.length === 1 ? "um" : "a"}:
            </span>
            {addenda.map((a) => (
              <Link
                key={a.oc_number}
                to="/dashboard/circulars/$ocNumber"
                params={{ ocNumber: encodeURIComponent(a.oc_number) }}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {a.oc_number}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => analytics.circularPdfViewed(decoded)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <FileText className="size-3.5" /> View original PDF
            </a>
          )}
        </div>
      </BentoCard>

      <SmartSummaryCard circular={circular} />

      <BentoCard>
        <CardLabel>Circular text</CardLabel>
        {hasContent ? (
          <div className="mt-3">
            <CircularTextView text={circular.content_text!} />
          </div>
        ) : (
          <div className="mt-3">
            <h3 className="font-serif text-xl">Full text isn&apos;t available</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-prose">
              We couldn&apos;t extract text for this circular
              {circular.ocr_status === "failed" ? " (text extraction failed)" : ""}. View the
              original PDF above instead.
            </p>
          </div>
        )}
      </BentoCard>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/dashboard/circulars"
      className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="size-3.5" /> Back to circulars
    </Link>
  );
}
