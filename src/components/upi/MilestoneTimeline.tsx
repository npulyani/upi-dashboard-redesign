import { Milestone } from "@/lib/upi/insights";
import { AppLink } from "./AppLink";

const TYPE_ICON: Record<Milestone["type"], string> = {
  ecosystem: "◆",
  app: "◉",
  geo: "◎",
};

const TYPE_COLOR: Record<Milestone["type"], string> = {
  ecosystem: "text-primary bg-primary/10",
  app: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
  geo: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
};

export function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  if (!milestones.length) {
    return (
      <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest py-12 text-center">
        Loading milestones…
      </p>
    );
  }

  return (
    <ol className="relative ml-4 border-l border-foreground/10 space-y-0">
      {[...milestones].reverse().map((m, i) => (
        <li key={i} className="relative pl-6 pb-6 last:pb-0">
          {/* Dot */}
          <span
            className={`absolute -left-[9px] top-0.5 flex items-center justify-center size-4 rounded-full text-[9px] font-bold ring-2 ring-background ${TYPE_COLOR[m.type]}`}
          >
            {TYPE_ICON[m.type]}
          </span>

          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {m.month} {m.year}
          </span>
          <h4 className="font-serif text-lg mt-0.5 leading-tight">{m.label}</h4>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            {m.description}{" "}
            {m.app && (
              <AppLink app={m.app} className="text-primary underline underline-offset-2 hover:opacity-80" />
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
