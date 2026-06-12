// Module-scope chart constants so Recharts props stay referentially stable
// across renders (inline objects would defeat React.memo on the sections).

export const SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export const AXIS_TICK = { fontSize: 10, fontFamily: "var(--font-mono)" } as const;
export const AXIS_TICK_SM = { fontSize: 9, fontFamily: "var(--font-mono)" } as const;

export const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-card)",
  fontSize: 12,
} as const;

export const TOOLTIP_STYLE_SM = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-card)",
  fontSize: 11,
} as const;
