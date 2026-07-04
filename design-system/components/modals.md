# Modal-family components (Dialog, AlertDialog, Sheet, Drawer, Popover, HoverCard)

Six Radix-based overlay components are installed. Only one is actually used
in the running app. This doc records what each one implements today so a
future consolidation decision is based on real code, not guesswork.

## Usage in the app today

| Component | Source | Real usage |
|---|---|---|
| `Dialog` | [`ui/dialog.tsx`](../../src/components/ui/dialog.tsx) | **Yes** — [`KeyboardShortcutOverlay.tsx`](../../src/components/upi/KeyboardShortcutOverlay.tsx), the "?" shortcuts help panel. This is the **only** shadcn primitive used anywhere in `src/routes` or `src/components/upi`. |
| `AlertDialog` | [`ui/alert-dialog.tsx`](../../src/components/ui/alert-dialog.tsx) | None. Zero imports outside its own file. |
| `Sheet` | [`ui/sheet.tsx`](../../src/components/ui/sheet.tsx) | None outside `ui/sidebar.tsx` (itself unused). |
| `Drawer` | [`ui/drawer.tsx`](../../src/components/ui/drawer.tsx) (wraps `vaul`) | None anywhere. |
| `Popover` | [`ui/popover.tsx`](../../src/components/ui/popover.tsx) | None anywhere — the app's own tooltip-like surfaces (`StateMap` hover card, chart tooltips) are hand-built `<div>`s, not this component. |
| `HoverCard` | [`ui/hover-card.tsx`](../../src/components/ui/hover-card.tsx) | None anywhere. |

## Shape comparison (as implemented)

All six share the same visual DNA (they're all shadcn "new-york" style + Radix), but each re-declares it independently — there is no shared base style, no shared `overlayVariants`/`contentVariants`:

| | Overlay | Content shell | Corner treatment | Animation |
|---|---|---|---|---|
| Dialog | `bg-black/80`, `z-50`, fixed inset-0 | centered, `max-w-lg`, `border bg-background p-6 shadow-lg`, has built-in `X` close button | `sm:rounded-lg` | fade + zoom-95, `data-[state]` driven |
| AlertDialog | identical overlay markup, hand-copied | identical centered shell, hand-copied, **no close button** (modal, must use Action/Cancel) | `sm:rounded-lg` | same fade+zoom |
| Sheet | identical overlay markup, hand-copied | slides from `side` (`top/bottom/left/right`, default `right`), `cva`-driven, has close `X` | none (edge-anchored) | slide-in/out via `cva` variants |
| Drawer | plain `bg-black/80`, no animation classes | bottom sheet, `rounded-t-[10px]` (its own one-off radius, doesn't match the `--radius` scale), drag handle bar | `rounded-t-[10px]` | delegated to `vaul` library, not Tailwind `data-[state]` |
| Popover | none (not modal) | `w-72 rounded-md border bg-popover p-4 shadow-md`, side-aware slide-in | `rounded-md` | fade + zoom-95, side-aware slide |
| HoverCard | none (not modal) | `w-64 rounded-md border bg-popover p-4 shadow-md` — nearly identical to Popover, only width differs (64 vs 72) and trigger interaction (hover vs click) | `rounded-md` | identical to Popover |

## Variants / states

- **Dialog / AlertDialog / Sheet**: driven by Radix `data-[state=open|closed]` — no manual state prop needed, Tailwind `animate-in`/`animate-out` (via `tw-animate-css`) handle enter/exit.
- **Sheet** additionally exposes a `side` variant (`top | bottom | left | right`, cva-typed) — the only one of the six with a documented variant API.
- **AlertDialog** reuses `buttonVariants` directly for its `Action` (default variant) and `Cancel` (`outline` variant) buttons — the one place in the whole `ui/` folder where two primitives are actually composed together.
- None of the six implement a loading/busy state (not applicable to static overlay chrome, but worth noting if any future modal needs an async confirm flow).

## Accessibility notes

- Dialog/AlertDialog/Sheet/Drawer all get correct Radix dialog semantics (focus trap, `aria-modal`, Escape-to-close, return focus to trigger) for free — no custom a11y code needed if these are adopted.
- Dialog's close button includes `<span className="sr-only">Close</span>` for a screen-reader label; AlertDialog's Cancel/Action buttons rely on their own text content instead.
- Popover/HoverCard get Radix's roving-focus + Escape handling; HoverCard specifically also supports keyboard-focus-triggered open (Radix default), which the app's hand-rolled tooltip-like `<div>` in `StateMap.tsx` does **not** — that one is `pointer-events-none` and mouse-only (see [state-map.md](./state-map.md)).

## Recommendation

See [AUDIT.md § Consolidation](../AUDIT.md#5-duplicateoverlapping-components) — Popover and HoverCard are near-duplicates (only width + trigger event differ) and are strong candidates to collapse into one, and four of the six overlay primitives can likely be deleted outright if no near-term feature needs them (they add ~40KB of maintained-but-dead component code plus five separate Radix dependencies).
