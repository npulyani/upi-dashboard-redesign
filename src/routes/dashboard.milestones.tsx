import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useDashboard } from "@/components/upi/DashboardContext";
import { BentoCard, CardLabel } from "@/components/upi/BentoCard";
import { MilestoneTimeline } from "@/components/upi/MilestoneTimeline";
import { getAllMonthsData } from "@/lib/upi/queries";
import { extractMilestones, Milestone } from "@/lib/upi/insights";

export const Route = createFileRoute("/dashboard/milestones")({
  head: () => ({
    meta: [{ title: "Milestones — State of UPI" }],
  }),
  component: MilestonesPage,
});

function MilestonesPage() {
  const { metric } = useDashboard();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [filterType, setFilterType] = useState<"all" | Milestone["type"]>("all");
  const [filterApp, setFilterApp] = useState<string>("__all__");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await getAllMonthsData();
      if (cancelled) return;
      setMilestones(extractMilestones(all, metric));
    })();
    return () => { cancelled = true; };
  }, [metric]);

  const uniqueApps = useMemo(
    () => Array.from(new Set(milestones.filter((m) => m.app).map((m) => m.app!))).sort(),
    [milestones],
  );

  const filtered = useMemo(() => {
    let list = milestones;
    if (filterType !== "all") list = list.filter((m) => m.type === filterType);
    if (filterApp !== "__all__") list = list.filter((m) => m.app === filterApp);
    return list;
  }, [milestones, filterType, filterApp]);

  const currentStreak = useMemo(() => {
    if (!milestones.length) return null;
    // Find how many consecutive months the last #1 holder has been on top
    // by scanning the sorted milestone list for most recent "#1" milestone
    const rankOneMilestones = milestones.filter((m) => m.label.includes("reached #1"));
    if (!rankOneMilestones.length) return null;
    const last = rankOneMilestones[rankOneMilestones.length - 1];
    return last;
  }, [milestones]);

  return (
    <div className="grid grid-cols-12 gap-5">
      {/* Summary stats */}
      <BentoCard className="col-span-12" tone="dark">
        <CardLabel className="text-background/60">Milestone tracker · {metric}</CardLabel>
        <h2 className="font-serif text-3xl mt-1 text-background">
          {milestones.length} significant moments since Jan 2021
        </h2>
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">Ecosystem</p>
            <p className="font-serif text-2xl mt-1 text-background">
              {milestones.filter((m) => m.type === "ecosystem").length}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">App milestones</p>
            <p className="font-serif text-2xl mt-1 text-background">
              {milestones.filter((m) => m.type === "app").length}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-background/50">Showing</p>
            <p className="font-serif text-2xl mt-1 text-background">{filtered.length}</p>
          </div>
        </div>
      </BentoCard>

      {/* Filters */}
      <BentoCard className="col-span-12">
        <div className="flex flex-wrap items-center gap-3">
          <CardLabel>Filter</CardLabel>
          <div className="inline-flex items-center bg-foreground/[0.04] p-1 rounded-full ring-1 ring-black/5">
            {(["all", "ecosystem", "app"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all capitalize ${
                  filterType === t
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "all" ? "All types" : t === "ecosystem" ? "Ecosystem" : "App events"}
              </button>
            ))}
          </div>
          <select
            value={filterApp}
            onChange={(e) => setFilterApp(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="__all__">All apps</option>
            {uniqueApps.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </BentoCard>

      {/* Timeline */}
      <BentoCard className="col-span-12">
        <MilestoneTimeline milestones={filtered} />
      </BentoCard>
    </div>
  );
}
