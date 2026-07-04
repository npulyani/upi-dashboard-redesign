# Feature widgets (StateMap, SeasonalityHeatmap, MilestoneTimeline, PerCapitaInsights, YearCalendar)

These are single-purpose visualization components, not reusable primitives —
included here because they're where most of the hardcoded-value findings in
[AUDIT.md](../AUDIT.md) live. Documented for the inconsistencies, not as a
reusable API surface.

## StateMap

Source: [`upi/StateMap.tsx`](../../src/components/upi/StateMap.tsx)

Choropleth map (`react-simple-maps`) with a custom hover tooltip and a
gradient legend.

- **Hardcoded colors:** `fill="#e5e7eb"` (empty-state gray, appears twice), `stroke="#ffffff"` on every geography outline. These are raw hex, not `var(--border)`/`var(--muted)` tokens, and happen to be close-but-not-identical to the theme's actual muted/border oklch values.
- **Sequential/diverging color ramps** (`seqColor`, `divColor`, referenced via `SEQ_MIN`/`SEQ_MAX`/`DIV_BELOW`/`DIV_ABOVE`) are computed as raw `rgb()` strings and injected via inline `style={{ background: "linear-gradient(...)" }}` — necessary since Tailwind can't express a data-driven gradient, but means the map's color ramp lives completely outside the token system with no shared reference to `--chart-*`.
- **Tooltip** is a hand-built `position: fixed` div (`rounded-lg border bg-popover px-3 py-2 shadow-md text-xs font-mono`) that tracks the mouse via inline `left`/`top`/`transform` styles — functionally a tooltip, but doesn't use `ui/tooltip.tsx` (Radix Tooltip, also unused elsewhere) and is `pointer-events-none`/mouse-only, so it isn't reachable via keyboard at all.
- **Legend labels** use the `text-[9px] uppercase tracking-wider` micro-label pattern — a third variant of the "eyebrow" idiom (9px + `tracking-wider`, vs. `CardLabel`'s 10px + `tracking-[0.18em]`).

## SeasonalityHeatmap

Source: [`upi/SeasonalityHeatmap.tsx`](../../src/components/upi/SeasonalityHeatmap.tsx)

Year × month grid, each cell colored by a 7-step bucket function (`cellColor`).

- **7-step hardcoded color ramp**, all raw Tailwind palette classes, no tokens: `bg-emerald-500` / `bg-emerald-400` / `bg-emerald-300/80` (mid-positive) / `bg-foreground/8` (neutral) / `bg-rose-200/80` / `bg-rose-400` / `bg-rose-600`, with text color flipping between `text-white`, `text-emerald-950`, `text-rose-900`, `text-foreground` per step. This is the widest spread of the emerald/rose convention in the app — a single component using 6 distinct shades of each hue.
- Same three arbitrary micro-label sizes appear again: `text-[10px]` (headers/year labels), `text-[11px]` (cell values), `text-[9px]` (footer caption) — all `uppercase tracking-widest font-mono`, none using `CardLabel`.

## MilestoneTimeline

Source: [`upi/MilestoneTimeline.tsx`](../../src/components/upi/MilestoneTimeline.tsx)

- **Type-to-color map** (`TYPE_COLOR`) introduces a *third* hardcoded semantic-color pair beyond emerald/rose: `text-blue-600 bg-blue-50 dark:bg-blue-950/40` (app milestones) and `text-amber-600 bg-amber-50 dark:bg-amber-950/40` (geo milestones) — the only place in the app that hand-writes a `dark:` variant for a raw palette color (everywhere else, dark mode is handled automatically by the semantic CSS variables switching in `.dark`). This is a real inconsistency: these two colors won't adapt if the token-based theme ever changes, and they're the only reason `dark:` utility classes appear in a `upi/` component at all.
- Reuses the `text-[10px] uppercase tracking-widest` eyebrow pattern inline (not `CardLabel`) for month/year labels.

## PerCapitaInsights

Source: [`upi/PerCapitaInsights.tsx`](../../src/components/upi/PerCapitaInsights.tsx)

- Wraps its output in a **one-off card shell** that is neither `BentoCard` nor `ui/card.tsx`: `rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] p-4 space-y-3` — a third card treatment, with its own radius (`rounded-xl`, matching shadcn's `Card` rather than `BentoCard`'s `rounded-[28px]`) and its own border/surface opacity values not used anywhere else.
- Numbered list markers (`text-[10px] text-primary/50`) and the section eyebrow (`text-[10px] uppercase tracking-widest`) are, again, inlined rather than using `CardLabel`.

## YearCalendar

Source: [`upi/YearCalendar.tsx`](../../src/components/upi/YearCalendar.tsx)

Grid of month cells with a "story" annotation per cell. Uses the same
`text-[10px]`/`text-[9px]` eyebrow-label pattern and the emerald/rose
positive/negative convention as the rest of the app (consistent with the
majority pattern — no new colors introduced here).

---

**Pattern across all five:** every one of them re-derives the "10/9/11px,
uppercase, tracking-widest-ish, font-mono" micro-label instead of importing
`CardLabel` from `BentoCard.tsx`, and every color-coded one reaches for raw
Tailwind palette classes instead of a shared positive/negative/neutral
token. See [AUDIT.md § Priority fixes](../AUDIT.md#priority-fixes) for the
consolidation plan.
