import type { TipLine } from "@/components/upi/HoverTip";
import { formatIndianNumber } from "@/lib/upi/queries";
import { AppMonthData, Metric } from "@/lib/upi/types";

export const signedPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/** ₹ per transaction: value is in ₹ crore, volume in millions. */
export const avgTicketInr = (r: AppMonthData) =>
  r.cit_volume_mn > 0 ? (r.cit_value_cr * 10) / r.cit_volume_mn : null;

/** Shared hover lines for an app's month: volume, value, share, avg ticket and change. */
export function appTipLines(
  row: AppMonthData,
  prev: AppMonthData | undefined,
  metric: Metric,
  total: number,
  prevLabel: string,
): TipLine[] {
  const pick = (r: AppMonthData) => (metric === "volume" ? r.cit_volume_mn : r.cit_value_cr);
  const ticket = avgTicketInr(row);
  const lines: TipLine[] = [
    {
      label: "Transactions",
      value: `${row.cit_volume_mn.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Mn`,
    },
    { label: "Value", value: `₹${formatIndianNumber(row.cit_value_cr)} Cr` },
  ];
  if (total > 0) {
    lines.push({
      label: `${metric === "volume" ? "Volume" : "Value"} share`,
      value: `${((pick(row) / total) * 100).toFixed(2)}%`,
    });
  }
  if (ticket != null) lines.push({ label: "Avg ticket", value: `₹${formatIndianNumber(ticket)}` });
  if (prev) {
    lines.push({
      label: `${prevLabel} ${metric === "volume" ? "transactions" : "value"}`,
      value:
        metric === "volume"
          ? `${prev.cit_volume_mn.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Mn`
          : `₹${formatIndianNumber(prev.cit_value_cr)} Cr`,
    });
  }
  return lines;
}
