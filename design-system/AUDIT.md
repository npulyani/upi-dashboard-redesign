# Design System Audit — UPI Dashboard

Scope: `src/components/ui/*` (shadcn "new-york" primitives), `src/components/upi/**` (custom app components), `src/routes/*` (page-level usage), `src/styles.css` (token source of truth). Every finding below was confirmed by reading the actual file or by grep — see inline links for the exact command/location. Nothing in this report is inferred from convention or assumption.

## TL;DR

The real, load-bearing design system of this app is **not** the installed
shadcn/ui library — it's a small, undocumented set of custom components
(`BentoCard`, `CardLabel`, `RankBadge`, `AppLogo`, `AppLink`, `ShareButton`,
`MetricToggle`) plus the CSS-variable theme in `styles.css`. Of the 46
shadcn primitives installed under `src/components/ui/`, **only one
(`Dialog`) has a real call site** in the app. The other 45 are maintained
dead weight. Meanwhile, the components that *are* the design system are
scattered, undocumented, and reimplement the same handful of patterns
(eyebrow labels, positive/negative color coding, card shells) slightly
differently in 15–20 places each.

## 1. Coverage score

| Layer | Total files | Actually imported by `routes/` or `upi/` | Coverage |
|---|---|---|---|
| `src/components/ui/*` (shadcn) | 46 | 1 (`dialog.tsx`) | **2%** |
| `src/components/upi/*` (custom) | 28 | 28 (all referenced from routes) | 100% |

Method: `grep -rhoE 'from ["\047]@/components/ui/[a-z-]+["\047]' src/routes src/components/upi` returns exactly one match, `@/components/ui/dialog`. Full breakdown in [components/unused-primitives.md](./components/unused-primitives.md).

**Reading this number:** it isn't a criticism of the shadcn install — it's a normal byproduct of scaffolding a project with the full component set up front and then building the actual UI custom (the app has a very distinct bento-grid/editorial aesthetic that the default shadcn look doesn't match). The issue is that nobody has since decided which layer is canonical, so both exist, undocumented, at the same time.

## 2. Un-tokenized recurring values

Confirmed by grep across `src/components` and `src/routes` (`--include="*.tsx"`):

- **Eyebrow micro-label** (`font-mono uppercase tracking-widest`, one of `text-[9px]`/`text-[10px]`/`text-[11px]`): a real component exists for this (`CardLabel` in `BentoCard.tsx`) and is correctly used in 20 files, but the same visual pattern is **reimplemented inline with slightly different arbitrary values** in at least 25 more files (`MilestoneTimeline`, `PerCapitaInsights`, `SeasonalityHeatmap`, `StateMap`, `KeyboardShortcutOverlay`, `RankBadge`, all of `dashboard.*.tsx`, etc. — see [components/feature-widgets.md](./components/feature-widgets.md)).
- **Positive/negative semantic color**: `emerald-*` (up) / `rose-*` (down) is used as a consistent idiom across **11 files**, but every call site picks its own shade (`600`/`500`/`400`/`300`/`950`, with or without `/10`, `/80` opacity) with no shared variable. `SeasonalityHeatmap.tsx` alone uses 7 distinct shades across its color-bucket function. Proposed tokens (`--color-positive`, `--color-negative`) are drafted in [tokens.css](./tokens.css) §2.
- **A third, one-off semantic pair**: `MilestoneTimeline.tsx` introduces `blue-*`/`amber-*` for its `app`/`geo` milestone types, including the only hand-written `dark:` variant in any `upi/` component — everywhere else, dark mode is handled by the CSS-variable theme switching automatically.
- **Card radius mismatch**: `BentoCard` uses `rounded-[28px]`, a value that doesn't sit on any step of the theme's own `--radius` scale (nearest token, `--radius-4xl`, is 26px). shadcn's own `Card` uses `rounded-xl` (18px) — a third radius. `PerCapitaInsights` uses a fourth ad hoc card shell at `rounded-xl` too, but with different border/surface opacity than either.
- **34 raw inline `style={{...}}` props** across 15 files (full list: `grep -rn 'style={{' src --include="*.tsx"`), mostly justified (dynamic width/height/color values Tailwind can't express — chart geometry, computed gradients) but worth a second look in bulk since a few (`RankMovers`'s animation delay, `AppLogo`'s font-size-by-prop) could arguably move to CSS custom properties instead.

## 3. Naming / structural inconsistencies

- **Two unrelated controls share one file**: `MonthScrubber` and `MetricToggle` both live in `Controls.tsx` with no shared theme beyond the file — not wrong, but the file name doesn't hint at either control's actual name.
- **`AppLogo`'s `rounded` prop** maps `"lg"` → Tailwind's `rounded-xl` class, not `rounded-lg` — a naming trap for anyone extending this prop later.
- **`AppLink`'s `className` prop fully replaces** the default hover/underline styling instead of merging via `cn()` — every call site that wants custom styling has to manually re-add `hover:text-primary underline-offset-4` to keep the affordance (confirmed one place, `MilestoneTimeline.tsx:43`, already does this by hand).

## 4. A functional bug found in passing

`ShareButton.tsx` calls `toast.success(...)` / `toast.error(...)` from the `sonner` package, but **no `<Toaster />` is mounted anywhere in the app** (`grep -rn "<Toaster" src` → zero matches, including `src/routes/__root.tsx`). `sonner` requires a mounted `Toaster` to render its queue, so these calls are currently silent no-ops — the Share button's only success/failure feedback to the user does not render. Details in [components/unused-primitives.md](./components/unused-primitives.md).

## 5. Duplicate/overlapping components

| Pattern | Real component | Unused shadcn twin | Verdict |
|---|---|---|---|
| Card | `BentoCard` (28 usages) | `ui/card.tsx` (0 usages) | Formalize `BentoCard` as canonical; document it; stop shipping `ui/card.tsx` unless a future feature needs its header/footer compound-component shape. |
| Badge/delta indicator | `RankBadge` (2 usages) | `ui/badge.tsx` (0 usages) | Keep `RankBadge` as-is (it's a specific delta indicator, not a general badge) but move its emerald/rose colors onto the proposed semantic tokens. |
| Form select | `MonthScrubber`'s native `<select>` (1 usage) | `ui/select.tsx`, Radix-based (0 usages) | The Radix version has strictly better a11y (listbox semantics, typeahead) for no visual cost — worth migrating if the month picker ever grows more complex than 2 flat lists. Low priority today. |
| Segmented toggle | `MetricToggle` hand-rolled buttons (1 usage) | `ui/toggle-group.tsx` + `ui/toggle.tsx` (0 usages) | Same call as Select — Radix version gives roving-tabindex/arrow-key nav for free. Low priority, only 2 options today. |
| Modal/overlay | `Dialog` (1 usage) | `AlertDialog`, `Sheet`, `Drawer`, `Popover`, `HoverCard` (0 usages each) | `Popover` and `HoverCard` are near-identical (only width + trigger event differ) — collapse into one if either is ever adopted. The other four can likely be deleted outright; see [components/modals.md](./components/modals.md) for the full side-by-side. |
| Toast | raw `sonner` `toast()` (1 usage, broken — see §4) | `ui/sonner.tsx` themed `Toaster` (0 usages, never mounted) | Mount the themed `Toaster` once in `__root.tsx`. This fixes the bug in §4 and gets the toast UI onto the app's actual color tokens instead of sonner's defaults. |

## Priority fixes

Ordered by (impact × effort), highest first:

1. **Mount `<Toaster />` in `__root.tsx`.** One-line fix, resolves a real broken user-facing feedback path (§4).
2. **Define `--color-positive` / `--color-negative` tokens** and point `RankBadge`, `SeasonalityHeatmap`, `PerCapitaInsights`/insight cards, `StateMap`, and `YearCalendar` at them instead of hand-picked emerald/rose shades. Draft values in [tokens.css](./tokens.css). This is the single highest-leverage fix — it's the most duplicated pattern in the codebase (11 files) and currently the easiest one to get subtly wrong (e.g. accidentally picking a shade that fails contrast in dark mode, since none of the raw palette picks were verified against `.dark`).
3. **Formalize `BentoCard`/`CardLabel` as the documented card system**, and either delete `ui/card.tsx`/`ui/badge.tsx` or clearly mark them "not for use — see BentoCard" so nobody reaches for the wrong one later.
4. **Decide on `BentoCard`'s radius.** Either add a `--radius-bento` token (drafted in tokens.css) so it's an intentional, named decision, or change it to `rounded-4xl` (26px, the closest existing scale step) if the 2px difference was never intentional. Right now it's silently off-scale.
5. **Delete or clearly quarantine the unused shadcn primitives** (45 of 46 files, [full list](./components/unused-primitives.md)) — either remove them from the repo, or move them to a location that signals "reference only, not wired up" so future contributors don't build on top of e.g. `ui/select.tsx` assuming it's live, when `Controls.tsx` is actually what renders.
6. **Reconcile the "eyebrow label" pattern** — either export `CardLabel` from a more central location so it's easy to find, or accept the inline duplication but standardize on one size (10px) and one tracking value (`0.18em`) so the 9px/11px variants stop drifting.

## Files produced by this audit

- [`tokens.css`](./tokens.css) — full existing token set (copied from `styles.css`) plus proposed additions for the un-tokenized recurring values above.
- [`components/button.md`](./components/button.md)
- [`components/input-select.md`](./components/input-select.md)
- [`components/modals.md`](./components/modals.md) — Dialog/AlertDialog/Sheet/Drawer/Popover/HoverCard
- [`components/card-badge.md`](./components/card-badge.md) — Card/BentoCard, Badge/RankBadge
- [`components/upi-primitives.md`](./components/upi-primitives.md) — AppLink, AppLogo, ShareButton, MonthScrubber, MetricToggle
- [`components/feature-widgets.md`](./components/feature-widgets.md) — StateMap, SeasonalityHeatmap, MilestoneTimeline, PerCapitaInsights, YearCalendar
- [`components/unused-primitives.md`](./components/unused-primitives.md) — the 45 shadcn files with no real call site
