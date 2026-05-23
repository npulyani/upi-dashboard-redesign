export function RankBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground">
        —
      </span>
    );
  }
  const up = delta > 0; // positive delta = climbed (rank number decreased)
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        up ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"
      }`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}
