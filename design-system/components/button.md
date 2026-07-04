# Button

Source: [`src/components/ui/button.tsx`](../../src/components/ui/button.tsx)
Built on: `class-variance-authority`, `@radix-ui/react-slot`

> **Usage note:** this component is defined but has **zero real call sites** in
> the app. Its only "importers" are other unused shadcn scaffold files
> (`pagination.tsx`, `alert-dialog.tsx`, `calendar.tsx`, `sidebar.tsx`,
> `carousel.tsx`), none of which are themselves imported anywhere in
> `src/routes` or `src/components/upi`. Every clickable control in the actual
> app (`ShareButton`, `MetricToggle`, month `<select>`s, the shortcuts-help
> trigger in `dashboard.tsx`) is a hand-rolled `<button>`/`<select>` with its
> own inline classes. See [AUDIT.md](../AUDIT.md) for the consolidation
> recommendation.

## Variants (`variant` prop)

| Variant | Classes | Notes |
|---|---|---|
| `default` (default) | `bg-primary text-primary-foreground shadow hover:bg-primary/90` | |
| `destructive` | `bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90` | |
| `outline` | `border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground` | |
| `secondary` | `bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80` | |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` | no border/shadow |
| `link` | `text-primary underline-offset-4 hover:underline` | renders as text, no padding change |

## Sizes (`size` prop)

| Size | Classes |
|---|---|
| `default` | `h-9 px-4 py-2` |
| `sm` | `h-8 rounded-md px-3 text-xs` |
| `lg` | `h-10 rounded-md px-8` |
| `icon` | `h-9 w-9` (square, for icon-only buttons) |

## States

- **hover** — per-variant background shift (e.g. `hover:bg-primary/90`), defined via Tailwind `hover:` in the same class string, no separate state layer.
- **focus-visible** — `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring` (1px ring, keyboard-only).
- **disabled** — `disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed`. Uses the native `disabled` attribute (no `aria-disabled` fallback).
- **active/pressed** — no explicit active state defined; relies on native browser default.
- **loading** — **not implemented**. No `loading` prop, spinner slot, or `aria-busy` handling exists on this component. (Contrast with `ShareButton`, the one real button in the app, which implements its own busy state manually — see [`upi-share-button.md`](./upi-share-button.md).)

## Props

```ts
interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean; // renders via Radix Slot onto the child element instead of a <button>
}
```

## Accessibility notes

- Renders a native `<button>` by default — gets correct implicit role and keyboard behavior (Enter/Space) for free.
- `disabled` is native, so it's automatically excluded from the tab order and announced by AT.
- Icon children get `[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0` — icons are click-through and consistently sized, but **no automatic accessible name** is added for icon-only (`size="icon"`) buttons; callers must supply their own `aria-label` or visible text.
- `asChild` + Slot means accessibility semantics (role, keyboard handling) come from whatever element is passed in — verify the child is a real interactive element (e.g. `<a>`) when using this.
