# Installed but unused shadcn primitives

45 of the 46 files in `src/components/ui/` have **zero import sites** in
`src/routes` or `src/components/upi` (confirmed by grepping every
`from "@/components/ui/*"` import in those two trees — see
[AUDIT.md § coverage](../AUDIT.md#coverage-score) for the full method and
count). `Dialog` is the sole exception, with one real call site (see
[modals.md](./modals.md)). Eight more files — Button, Sheet, Toggle,
Tooltip, Label, Separator, Input, Skeleton — are at least referenced
*somewhere* in `src/`, but only as internal dependencies of other unused
`ui/` scaffold files (`sidebar.tsx`, `command.tsx`, `form.tsx`,
`calendar.tsx`, `carousel.tsx`, `pagination.tsx`, `alert-dialog.tsx`), which
are themselves dead — so those eight are effectively unused in practice
too, just not textually isolated.

Rather than write a full variants/states/props/a11y doc for two dozen
components nothing in the app renders, this file records what exists today
at a glance, so a future feature that needs one of these doesn't have to
re-derive it from scratch — and so it's clear this is inventory, not active
design system surface.

| Component | Variants (as coded) | Notable state handling |
|---|---|---|
| `alert.tsx` | `default`, `destructive` (cva) | `role="alert"` set automatically |
| `tabs.tsx` | none (single style) | `data-[state=active]` gets `bg-background shadow`; full keyboard nav via Radix |
| `table.tsx` | none | `TableRow` has `hover:bg-muted/50` and `data-[state=selected]:bg-muted` built in |
| `skeleton.tsx` | none | `animate-pulse bg-primary/10 rounded-md` — one-line loading placeholder, not used anywhere despite every route having async data fetches |
| `separator.tsx` | `orientation`: `horizontal`/`vertical` (prop, not cva) | decorative by default (`aria-hidden` via Radix) |
| `toggle.tsx` | `variant`: `default`/`outline`; `size`: `default`/`sm`/`lg` (cva) | `data-[state=on]` styling; see [upi-primitives.md](./upi-primitives.md) for the hand-rolled equivalent (`MetricToggle`) actually in use |
| `label.tsx` | none | `peer-disabled:` styling hooks, needs a sibling with the `peer` class to activate |
| `checkbox.tsx` | none | `data-[state=checked]:bg-primary`; renders own check icon via `CheckboxPrimitive.Indicator` |
| `switch.tsx` | none | thumb translate driven by `data-[state=checked\|unchecked]` |
| `accordion.tsx`, `avatar.tsx`, `progress.tsx`, `radio-group.tsx`, `slider.tsx`, `toggle-group.tsx`, `command.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `pagination.tsx`, `breadcrumb.tsx`, `calendar.tsx`, `carousel.tsx`, `collapsible.tsx`, `form.tsx`, `input-otp.tsx`, `resizable.tsx`, `scroll-area.tsx`, `sidebar.tsx`, `sonner.tsx`, `aspect-ratio.tsx`, `chart.tsx` | not audited line-by-line | zero references anywhere in `src/routes` or `src/components/upi`; standard un-modified shadcn output |

`sonner.tsx` is worth calling out specifically, and it's a functional bug,
not just a style gap: it's a themed `<Toaster />` wrapper around the
`sonner` toast library. The raw `toast()` function from the `sonner`
package *is* called directly (bypassing this wrapper) in
[`ShareButton.tsx`](../../src/components/upi/ShareButton.tsx)
(`toast.success(...)`, `toast.error(...)`) — but grepping the whole `src`
tree for `<Toaster` finds **zero matches**. `sonner` requires a mounted
`<Toaster />` to actually render queued toasts; since neither the themed
wrapper nor the raw library's own `<Toaster />` is rendered anywhere
(including `src/routes/__root.tsx`), every `toast.success("Copied to
clipboard")` / `toast.error("Could not capture image")` call in
`ShareButton` is currently a silent no-op — the share button's only
user-facing feedback on success or failure is not rendering at all. This
should be treated as a bug fix (mount `<Toaster />` once in `__root.tsx`),
not a design-system documentation gap — flagged in
[AUDIT.md § Priority fixes](../AUDIT.md#priority-fixes).
