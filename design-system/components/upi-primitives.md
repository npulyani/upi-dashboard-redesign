# Custom UPI primitives (AppLink, AppLogo, ShareButton, MonthScrubber, MetricToggle)

These are the small, genuinely reusable building blocks that appear across
almost every dashboard route. Unlike the shadcn `ui/` folder, all of these
are actively used.

## AppLink

Source: [`upi/AppLink.tsx`](../../src/components/upi/AppLink.tsx)

Thin wrapper around TanStack Router's `Link` that always points at
`/dashboard/app/$appName`.

- **Props:** `app: string` (required, becomes the route param, URI-encoded) · `children?: ReactNode` (defaults to `app` text) · `className?: string`
- **Default style:** `hover:text-primary hover:underline underline-offset-4 transition-colors` — only applied when `className` is *not* passed (the prop fully replaces the default rather than merging via `cn()`, so passing any `className` silently drops the hover/underline treatment). This is a minor footgun: every call site that wants custom styling has to re-add `hover:text-primary` manually if it wants the same affordance (e.g. `MilestoneTimeline.tsx:43` does this).
- **States:** relies entirely on native `:hover` — no focus-visible ring defined on the link itself (inherits browser default outline).
- **A11y:** renders a real `<a>`-equivalent (router `Link`), so it's keyboard-focusable and has a real `href` by default — good baseline a11y, just missing an explicit focus style to match the rest of the app's `focus-visible:ring-*` convention.

## AppLogo

Source: [`upi/AppLogo.tsx`](../../src/components/upi/AppLogo.tsx)

Three-tier fallback image: Clearbit logo → Google s2 favicon → deterministic initials tile.

- **Props:** `app: string` · `domain?: string | null` (DB-resolved domain takes priority over the static `logos.ts` map) · `size?: number` (px, default `28`) · `className?: string` · `rounded?: "full" | "md" | "lg"` (default `"md"`, maps to `rounded-full` / `rounded-md` / `rounded-xl` — note `"lg"` maps to Tailwind's `xl` class, a naming mismatch worth knowing about if extending this prop)
- **States:** internally tracks a `srcIdx` with a module-level `Map` cache (`srcIdxCache`) so once a given app/domain's logo source fails once, every subsequent mount skips straight to the next fallback — an unusual but deliberate perf/UX optimization, not a bug.
- **Fallback tile colors:** drawn from a curated 10-color `PALETTE` in [`lib/upi/logos.ts`](../../src/lib/upi/logos.ts) (hardcoded hex pairs, e.g. `#1e293b`/`#f8fafc`). These are **intentionally** outside the design-token system — they're a deterministic per-app palette (hashed by app name), not a semantic UI color, so tokenizing them would break their purpose. Documented here so they aren't mistaken for a missed-token bug.
- **A11y:** the initials fallback renders `role="img" aria-label={app}`, which is correct. The `<img>` path sets a real `alt`. Both fallback paths are accessible.

## ShareButton

Source: [`upi/ShareButton.tsx`](../../src/components/upi/ShareButton.tsx)

Captures a DOM node as a PNG (via `html-to-image`) and copies it to the clipboard, falling back to a file download.

- **Props:** `targetRef: React.RefObject<HTMLElement | null>` (required) · `label?: string` (default `"Share"`)
- **This is the only button-like control in the app that implements a real busy/loading state** — `busy` (local `useState`) disables the button and swaps the leading glyph to `…` while the async capture/clipboard/toast flow runs. Contrast with `ui/button.tsx`, which has no loading state at all.
- **Style:** hand-rolled, not `buttonVariants`: `rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-widest border border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-all disabled:opacity-50`. Uses arbitrary opacity values (`foreground/[0.03]`, `/[0.06]`) not seen elsewhere in exactly this combination.
- **A11y:** native `<button disabled={busy}>` — disabled state is correctly native. Has `title="Copy card as image"` for a mouse-hover hint but no `aria-label`, so screen readers only get the visible text ("↗ Share" / "… Share") — acceptable since the text is descriptive, but the `↗`/`…` glyphs are not marked `aria-hidden`, so AT may announce them literally.

## Controls: MonthScrubber & MetricToggle

Source: [`upi/Controls.tsx`](../../src/components/upi/Controls.tsx)

Two unrelated controls that live in the same file:

**MonthScrubber** — two native `<select>` elements (year, then month-within-year). See [input-select.md](./input-select.md) for how this compares to the unused `ui/select.tsx`. No loading/disabled state modeled — assumes `AVAILABLE_MONTHS` is always ready.

**MetricToggle** — a two-option (`"volume" | "value"`) segmented control, hand-built as a `<div>` of `<button>`s:

```
Container: inline-flex items-center bg-foreground/[0.04] p-1 rounded-full ring-1 ring-black/5
Button (active):   bg-card text-foreground shadow-sm
Button (inactive): text-muted-foreground hover:text-foreground
```

This is functionally identical to what `ui/toggle-group.tsx` + `ui/toggle.tsx` (Radix, unused) are designed for, but implemented as plain `<button>`s with manual active-state class branching instead of Radix's `data-[state=on]`. It works, but gets none of Radix ToggleGroup's built-in roving-tabindex/keyboard-arrow-navigation behavior — arrow-key navigation between the two options is not implemented, only Tab.
