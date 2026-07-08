import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, X, ArrowRight } from "lucide-react";
import { useNewCircularsCount } from "@/lib/upi/hooks";
import { analytics } from "@/lib/analytics";

/** Thin homepage banner pointing at new NPCI circulars. Dismiss is session-only — no persistence, reappears on refresh. */
export function NewCircularsBanner() {
  const count = useNewCircularsCount();
  const [dismissed, setDismissed] = useState(false);

  if (count === 0 || dismissed) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-card ring-1 ring-black/5 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Mail className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm">
          <span className="font-medium">
            {count} new circular{count === 1 ? "" : "s"}
          </span>{" "}
          <span className="text-muted-foreground">released in the last 30 days</span>
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/dashboard/circulars"
          className="text-sm font-medium underline-offset-2 hover:underline flex items-center gap-1"
          onClick={() => analytics.newCircularsBannerClicked(count)}
        >
          View circulars
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="size-6 flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
