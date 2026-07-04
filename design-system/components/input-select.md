# Input, Textarea & Select

Sources:
[`src/components/ui/input.tsx`](../../src/components/ui/input.tsx) ·
[`src/components/ui/textarea.tsx`](../../src/components/ui/textarea.tsx) ·
[`src/components/ui/select.tsx`](../../src/components/ui/select.tsx) (Radix Select wrapper)

> **Usage note:** `Input` has exactly one real importer — `src/components/ui/sidebar.tsx`
> — and `sidebar.tsx` is itself never imported by a route or `upi/` component.
> `Textarea` and `Select` (the styled Radix wrapper) have **zero importers
> anywhere**. Every actual form-like control in the app
> ([`Controls.tsx`](../../src/components/upi/Controls.tsx) `MonthScrubber`) is a
> raw native `<select>` with its own inline Tailwind classes. This is the
> clearest duplicate-implementation case in the codebase — documented in
> [AUDIT.md](../AUDIT.md).

## Input (`ui/input.tsx`)

Single visual style, no `variant`/`size` props (unlike Button/Badge).

```
flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1
text-base shadow-sm transition-colors
file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground
placeholder:text-muted-foreground
focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
disabled:cursor-not-allowed disabled:opacity-50
md:text-sm
```

- **States:** placeholder (muted-foreground), focus-visible (1px ring), disabled (native `disabled`, 50% opacity). No explicit error/invalid state styling (no `aria-invalid:` variant defined).
- **Props:** plain `React.ComponentProps<"input">` — all native input attributes pass through, including `type`.
- **A11y:** no built-in `<label>` association; must be paired manually with `ui/label.tsx` (which itself is used only inside `ui/form.tsx`, also unused in the app).

## Textarea (`ui/textarea.tsx`)

Same visual language as Input: `rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm`, `min-h-[60px]`. Same focus/disabled/placeholder states as Input. Zero real usage.

## Select (`ui/select.tsx`, Radix-based)

A full styled wrapper around `@radix-ui/react-select` (Trigger, Content, Item, Label, Separator, scroll buttons). Trigger uses the same border/shadow/focus language as Input (`h-9 ... rounded-md border border-input ... focus:ring-1 focus:ring-ring`). Content is a portaled popover (`rounded-md border bg-popover shadow-md`) with open/close zoom+fade animation via `data-[state=open|closed]`.

- **States:** `data-[placeholder]:text-muted-foreground`, `disabled:cursor-not-allowed disabled:opacity-50`, item `data-[disabled]`, `SelectItem` shows a check mark via `ItemIndicator` when selected.
- **A11y:** inherits full Radix Select accessibility (listbox semantics, roving focus, typeahead) — this is strictly better a11y than the native `<select>` it's meant to replace, which makes it not being used anywhere a real missed opportunity, not just a style inconsistency.

## What's actually used instead: `MonthScrubber` (native `<select>`)

[`Controls.tsx`](../../src/components/upi/Controls.tsx) implements two native `<select>` elements by hand:

```
h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium
ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
```

This is visually close to but not identical to `ui/input.tsx`/`ui/select.tsx` (different height — `h-8` vs `h-9`, different focus ring width — `ring-2` vs `ring-1`, and `text-xs` vs `text-base`/`text-sm`). Functionally it's a plain uncontrolled-by-Radix `<select>`, so it gets native browser dropdown behavior (fine for accessibility, but loses the consistent popover styling used everywhere else in the app for portaled surfaces).
