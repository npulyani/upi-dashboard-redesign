# Card & Badge

Two implementations exist for each: the shadcn primitive (unused) and a
custom one (used everywhere).

## Card

| | shadcn `Card` | Custom `BentoCard` |
|---|---|---|
| Source | [`ui/card.tsx`](../../src/components/ui/card.tsx) | [`upi/BentoCard.tsx`](../../src/components/upi/BentoCard.tsx) |
| Real usage | **None.** Zero imports anywhere outside its own file. | **All of it.** Every stat tile, insight card, and grid cell across `dashboard.index`, `dashboard.trends`, `dashboard.spending`, `dashboard.year`, `dashboard.app.$appName` is a `BentoCard`. |
| Shape | `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` — compound component, semantic sub-parts | Single component, `children` is freeform — no header/footer sub-parts |
| Radius | `rounded-xl` (18px, sits on the `--radius-2xl` step of the theme scale) | `rounded-[28px]` — **hardcoded, does not sit on any step of the `--radius` scale** (nearest token, `--radius-4xl`, is 26px) |
| Surface | `bg-card text-card-foreground shadow` (plain) | `bg-card text-card-foreground ring-1 ring-black/5` (adds a hairline ring shadcn's Card doesn't have) plus two extra tone variants (see below) |
| Variants | none | `tone`: `"light"` (default, `bg-card`) · `"primary"` (`bg-primary text-primary-foreground`) · `"dark"` (`bg-foreground text-background`) |
| Motion | none | `animate-in-up` (custom keyframe, `src/styles.css:142-151`) always applied, plus an optional `delay` prop (ms) staggered across sibling cards — every call site in the app uses this to stagger card entrance |
| Padding | `p-6` (header/content), `pt-0` on content | `p-6 lg:p-8` (larger on desktop) |

`BentoCard` is a real, consistently-used design-system component — it just isn't documented anywhere and duplicates ~70% of what `Card` already provides. See [AUDIT.md](../AUDIT.md) for the recommendation (formalize `BentoCard` as *the* card and delete/ignore `ui/card.tsx`, rather than maintaining both).

### CardLabel (co-located in `BentoCard.tsx`)

The "eyebrow" micro-label used at the top of most cards:

```
font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground
```

Used correctly (via the component) in 20 files. **Also reimplemented inline** with slightly different arbitrary values (`text-[9px]`, `text-[11px]`, `tracking-widest` instead of `tracking-[0.18em]`) in at least 19 other files — see [AUDIT.md § un-tokenized values](../AUDIT.md#2-un-tokenized-recurring-values) for the full file list. This is the single most duplicated micro-pattern in the codebase.

## Badge

| | shadcn `Badge` | Custom `RankBadge` |
|---|---|---|
| Source | [`ui/badge.tsx`](../../src/components/ui/badge.tsx) | [`upi/RankBadge.tsx`](../../src/components/upi/RankBadge.tsx) |
| Real usage | **None.** Zero imports anywhere. | Used in `RankMovers` (climbers/fallers list) and `dashboard.data.tsx`. |
| Variants | `default` / `secondary` / `destructive` / `outline` (cva, semantic-token-driven: `bg-primary`, `bg-secondary`, `bg-destructive`) | No variant prop — branches internally on `delta` sign: `delta === 0` → plain em-dash text; `delta > 0` → up-styled; `delta < 0` → down-styled |
| Colors | 100% semantic tokens (`bg-primary`, `bg-destructive`, etc.) | **Raw Tailwind palette classes**, not tokens: `bg-emerald-500/10 text-emerald-700` (up) / `bg-rose-500/10 text-rose-700` (down) — see the "positive/negative" convention documented in [tokens.css](../tokens.css) §2 |
| Shape | `rounded-md border px-2.5 py-0.5 text-xs font-semibold` | `rounded-full` (pill, not `rounded-md`) `px-1.5 py-0.5 font-mono text-[10px] font-medium` — different radius, different type scale, different font family than shadcn's Badge |

`RankBadge` isn't a general-purpose badge — it's a one-off delta indicator (▲/▼ + number). The emerald/rose color pair it introduces is the same pair used ad hoc in ~10 other files (see `tokens.css`), so it's a good candidate to become the canonical place that reads `--color-positive`/`--color-negative` once those tokens exist, rather than hardcoding the Tailwind palette names directly.
