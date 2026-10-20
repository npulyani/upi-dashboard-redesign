import {
  MouseEvent,
  ReactNode,
  RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type TipLine = { label: string; value: string; tone?: "up" | "down" };
export type TipContent = { title: ReactNode; lines: TipLine[] };
type TipState = { x: number; y: number; content: TipContent } | null;

/**
 * Cursor-following tooltip for plain-HTML charts (rows, bars) that aren't
 * Recharts. Put `ref` on a `relative` wrapper, call `show` from
 * onMouseMove / `hide` from onMouseLeave, and render <HoverTip> inside it.
 */
export function useHoverTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState>(null);
  const show = useCallback((e: MouseEvent, content: TipContent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { ref, tip, show, hide };
}

export function HoverTip({
  tip,
  containerRef,
}: {
  tip: TipState;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // Flip left/up so the tooltip stays inside the wrapper.
  useLayoutEffect(() => {
    if (!tip || !el.current || !containerRef.current) return;
    const W = containerRef.current.clientWidth;
    const { offsetWidth: w, offsetHeight: h } = el.current;
    let left = tip.x + 14;
    if (left + w > W) left = tip.x - w - 14;
    if (left < 0) left = Math.max(0, W - w);
    let top = tip.y - h - 10;
    if (top < 0) top = tip.y + 16;
    setPos({ left, top });
  }, [tip, containerRef]);

  if (!tip) return null;
  return (
    <div
      ref={el}
      role="tooltip"
      className="pointer-events-none absolute z-20 rounded-xl border border-border bg-card px-3 py-2 text-[11px] shadow-lg whitespace-nowrap"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="font-medium text-xs mb-1">{tip.content.title}</div>
      {tip.content.lines.map((l) => (
        <div key={l.label} className="flex items-baseline justify-between gap-4">
          <span className="text-muted-foreground">{l.label}</span>
          <span
            className={`font-mono tabular-nums ${
              l.tone === "up" ? "text-emerald-600" : l.tone === "down" ? "text-rose-600" : ""
            }`}
          >
            {l.value}
          </span>
        </div>
      ))}
    </div>
  );
}
