import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from "lucide-react";
import { useDashboard } from "@/components/upi/DashboardContext";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { Sparkline } from "@/components/upi/Sparkline";
import {
  getMonthData,
  getPreviousMonth,
  getAppTrend,
  formatIndianNumber,
} from "@/lib/upi/queries";
import { avgTicket } from "@/lib/upi/insights";
import { AppLink } from "@/components/upi/AppLink";
import { AppMonthData } from "@/lib/upi/types";

export const Route = createFileRoute("/dashboard/data")({
  head: () => ({
    meta: [
      { title: "Data — State of UPI" },
      { name: "description", content: "Full sortable UPI app dataset with month-over-month and trend sparklines." },
    ],
  }),
  component: DataPage,
});

type SortKey = "rank" | "volume" | "value" | "share" | "mom" | "name" | "ticket";
type Row = {
  rank: number;
  app_name: string;
  volume: number;
  value: number;
  share: number;
  mom: number | null;
  ticket: number;
  sparkline: number[];
};

function DataPage() {
  const { year, month, metric } = useDashboard();
  const [current, setCurrent] = useState<AppMonthData[]>([]);
  const [prev, setPrev] = useState<AppMonthData[]>([]);
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const cur = await getMonthData(year, month);
      const p = getPreviousMonth(year, month);
      const pd = p ? await getMonthData(p.year, p.month) : [];
      if (cancelled) return;
      setCurrent(cur);
      setPrev(pd);
      // Fetch sparklines for top 12 apps only (perf)
      const top = [...cur]
        .sort((a, b) =>
          metric === "volume" ? b.cit_volume_mn - a.cit_volume_mn : b.cit_value_cr - a.cit_value_cr,
        )
        .slice(0, 12);
      const trends = await Promise.all(
        top.map((r) => getAppTrend(r.app_name, 12, year, month)),
      );
      if (cancelled) return;
      const map: Record<string, number[]> = {};
      top.forEach((r, i) => {
        map[r.app_name] = trends[i].map((t) =>
          metric === "volume" ? t.cit_volume_mn : t.cit_value_cr,
        );
      });
      setSparks(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month, metric]);

  const rows: Row[] = useMemo(() => {
    const prevMap = new Map(prev.map((r) => [r.app_name, r]));
    const total = current.reduce(
      (a, b) => a + (metric === "volume" ? b.cit_volume_mn : b.cit_value_cr),
      0,
    );
    const sorted = [...current].sort((a, b) =>
      metric === "volume" ? b.cit_volume_mn - a.cit_volume_mn : b.cit_value_cr - a.cit_value_cr,
    );
    return sorted.map((r, i) => {
      const p = prevMap.get(r.app_name);
      const cur = metric === "volume" ? r.cit_volume_mn : r.cit_value_cr;
      const past = p ? (metric === "volume" ? p.cit_volume_mn : p.cit_value_cr) : null;
      return {
        rank: i + 1,
        app_name: r.app_name,
        volume: r.cit_volume_mn,
        value: r.cit_value_cr,
        share: total ? (cur / total) * 100 : 0,
        mom: past ? ((cur - past) / past) * 100 : null,
        ticket: avgTicket(r),
        sparkline: sparks[r.app_name] ?? [],
      };
    });
  }, [current, prev, metric, sparks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.app_name.toLowerCase().includes(q)) : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "rank":
          av = a.rank;
          bv = b.rank;
          break;
        case "name":
          av = a.app_name;
          bv = b.app_name;
          break;
        case "volume":
          av = a.volume;
          bv = b.volume;
          break;
        case "value":
          av = a.value;
          bv = b.value;
          break;
        case "share":
          av = a.share;
          bv = b.share;
          break;
        case "mom":
          av = a.mom ?? -Infinity;
          bv = b.mom ?? -Infinity;
          break;
        case "ticket":
          av = a.ticket;
          bv = b.ticket;
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, search, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(k === "name" || k === "rank" ? "asc" : "desc");
    }
  }

  function exportCsv() {
    const header = ["Rank", "App", "Volume (Mn)", "Value (Cr)", "Share %", "MoM %", "Avg Ticket (₹)"];
    const lines = [header.join(",")];
    filtered.forEach((r) => {
      lines.push(
        [
          r.rank,
          `"${r.app_name}"`,
          r.volume.toFixed(2),
          r.value.toFixed(2),
          r.share.toFixed(3),
          r.mom === null ? "" : r.mom.toFixed(3),
          r.ticket.toFixed(2),
        ].join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `upi-${year}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <BentoCard className="!p-0 overflow-hidden">
        <div className="p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-foreground/5">
          <div>
            <CardLabel>Performance breakdown · {month} {year}</CardLabel>
            <h3 className="font-serif text-3xl mt-1">All providers</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-foreground/[0.04] rounded-full px-3 py-2 ring-1 ring-black/5 w-full md:w-64">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search provider…"
                className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="size-3.5" /> CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest border-b border-foreground/5 bg-foreground/[0.02]">
                <Th onClick={() => toggleSort("rank")} active={sortKey === "rank"} dir={sortDir}>
                  Rank
                </Th>
                <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>
                  Provider
                </Th>
                <Th onClick={() => toggleSort("volume")} active={sortKey === "volume"} dir={sortDir} align="right">
                  Volume (Mn)
                </Th>
                <Th onClick={() => toggleSort("value")} active={sortKey === "value"} dir={sortDir} align="right">
                  Value (₹ Cr)
                </Th>
                <Th onClick={() => toggleSort("share")} active={sortKey === "share"} dir={sortDir} align="right">
                  Share
                </Th>
                <Th onClick={() => toggleSort("mom")} active={sortKey === "mom"} dir={sortDir} align="right">
                  MoM
                </Th>
                <th className="px-6 py-4 font-medium text-right">12-mo trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs uppercase tracking-widest font-mono text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.app_name} className="hover:bg-foreground/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground tabular-nums">
                    {String(r.rank).padStart(2, "0")}
                  </td>
                  <td className="px-6 py-4 font-medium">{r.app_name}</td>
                  <td className="px-6 py-4 text-right font-mono tabular-nums text-sm">
                    {r.volume.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono tabular-nums text-sm">
                    {formatIndianNumber(r.value)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center gap-2 font-mono tabular-nums text-xs">
                      <span className="hidden md:block w-16 h-1 bg-foreground/5 rounded-full overflow-hidden">
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${Math.min(100, r.share)}%` }}
                        />
                      </span>
                      {r.share.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-xs tabular-nums">
                    {r.mom === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={r.mom >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {r.mom >= 0 ? "▲" : "▼"} {Math.abs(r.mom).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-24 ml-auto text-primary">
                      {r.sparkline.length > 1 ? (
                        <Sparkline values={r.sparkline} height={28} filled={false} strokeWidth={1.5} />
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground block text-right">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 text-center border-t border-foreground/5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Showing {filtered.length} of {rows.length} providers
        </div>
      </BentoCard>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`px-6 py-4 font-medium select-none ${onClick ? "cursor-pointer hover:text-foreground" : ""} ${
        active ? "text-foreground" : ""
      } ${align === "right" ? "text-right" : ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        {onClick &&
          (active ? (
            dir === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3 opacity-30" />
          ))}
      </span>
    </th>
  );
}
