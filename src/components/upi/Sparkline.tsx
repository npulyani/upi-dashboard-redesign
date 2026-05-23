import { useMemo } from "react";

export function Sparkline({
  values,
  height = 48,
  color = "currentColor",
  filled = true,
  strokeWidth = 1.5,
}: {
  values: number[];
  height?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}) {
  const { d, fill, viewBox } = useMemo(() => {
    if (!values.length) return { d: "", fill: "", viewBox: "0 0 100 40" };
    const w = 100;
    const h = 40;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const step = values.length > 1 ? w / (values.length - 1) : w;
    const pts = values.map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return [x, y];
    });
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
    const fillPath = `${d} L${pts[pts.length - 1][0]},${h} L0,${h} Z`;
    return { d, fill: fillPath, viewBox: `0 0 ${w} ${h}` };
  }, [values]);

  return (
    <svg viewBox={viewBox} preserveAspectRatio="none" style={{ height, width: "100%" }} aria-hidden>
      {filled && <path d={fill} fill={color} fillOpacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
