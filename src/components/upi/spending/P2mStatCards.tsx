import { memo } from "react";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { P2PMPoint } from "@/lib/upi/queryOptions";
import { formatIndianNumber } from "@/lib/upi/queries";

/**
 * P2M/P2P headline stat cards (ported from the former Context page).
 * Rendered as the second row of hero cards on the Spending page.
 */
export const P2mStatCards = memo(function P2mStatCards({
  current,
  baseline,
}: {
  current: P2PMPoint;
  baseline: P2PMPoint | null;
}) {
  const p2mVolChange = baseline
    ? (current.p2m_volume_pct - baseline.p2m_volume_pct).toFixed(1)
    : null;

  return (
    <>
      <BentoCard className="col-span-12 sm:col-span-6 lg:col-span-4" delay={180}>
        <CardLabel>
          P2M Volume Share · {current.month} {current.year}
        </CardLabel>
        <div className="mt-3 font-serif text-5xl">{current.p2m_volume_pct.toFixed(1)}%</div>
        <p className="mt-2 text-sm text-muted-foreground">
          of all UPI transactions are merchant payments
          {p2mVolChange && (
            <span className="ml-1 text-foreground font-medium">
              (+{p2mVolChange} pp since Jan '21)
            </span>
          )}
        </p>
      </BentoCard>

      <BentoCard className="col-span-12 sm:col-span-6 lg:col-span-4" delay={220}>
        <CardLabel>
          P2M Avg Ticket · {current.month} {current.year}
        </CardLabel>
        <div className="mt-3 font-serif text-5xl">
          ₹{formatIndianNumber(Math.round(current.p2m_ticket))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          avg merchant payment size
          {baseline && (
            <span
              className={`ml-1 font-medium ${current.p2m_ticket < baseline.p2m_ticket ? "text-emerald-600" : "text-foreground"}`}
            >
              ({current.p2m_ticket < baseline.p2m_ticket ? "↓" : "↑"}
              {Math.abs(
                ((current.p2m_ticket - baseline.p2m_ticket) / baseline.p2m_ticket) * 100,
              ).toFixed(0)}
              % since Jan '21)
            </span>
          )}
        </p>
      </BentoCard>

      <BentoCard className="col-span-12 sm:col-span-6 lg:col-span-4" delay={260}>
        <CardLabel>
          P2P Avg Ticket · {current.month} {current.year}
        </CardLabel>
        <div className="mt-3 font-serif text-5xl">
          ₹{formatIndianNumber(Math.round(current.p2p_ticket))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          avg person-to-person transfer size
          {baseline && (
            <span
              className={`ml-1 font-medium ${current.p2p_ticket > baseline.p2p_ticket ? "text-foreground" : "text-muted-foreground"}`}
            >
              ({current.p2p_ticket > baseline.p2p_ticket ? "↑" : "↓"}
              {Math.abs(
                ((current.p2p_ticket - baseline.p2p_ticket) / baseline.p2p_ticket) * 100,
              ).toFixed(0)}
              % since Jan '21)
            </span>
          )}
        </p>
      </BentoCard>
    </>
  );
});
