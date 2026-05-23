## Goal

Show a logo next to every UPI app name across the dashboard (Overview, Trends, Data tab, deep-dive page, neighbors list). Fetch a real logo when we know the brand; otherwise render a clean initials-based placeholder that matches the design system.

## Approach

Runtime image fetching from arbitrary third parties is fragile (CORS, rate limits, broken URLs across 92+ apps and growing). Instead, use a **two-layer strategy** that is fast, deterministic, and offline-safe:

1. **Curated domain map** (`src/lib/upi/logos.ts`) — hand-mapped `appName → domain` for the ~50 well-known apps (PhonePe, Google Pay, Paytm, all major banks, fintechs). Logos are loaded from Google's favicon service: `https://www.google.com/s2/favicons?domain={domain}&sz=128`. This URL is stable, no API key, supports CORS as a plain `<img>`, and returns a transparent PNG.
   - Optional secondary source: `https://logo.clearbit.com/{domain}` for higher-res square logos where available (we'll try Clearbit first, fall back to Google favicon on `onerror`).
2. **Initials placeholder** — if no domain is mapped OR both image sources fail, render an SVG/CSS tile with the app's 1–2 initials. Background color is deterministically derived from a hash of the app name (picked from a small palette of design-system-friendly tones), foreground is `--background` or `--foreground` depending on contrast.

## New component

`src/components/upi/AppLogo.tsx`
- Props: `app: string`, `size?: number` (default 28), `className?`, `rounded?: "full" | "md"` (default `"md"`)
- Internally: looks up domain, renders `<img>` with `onError` chain (Clearbit → Google favicon → initials SVG). Uses `useState` to track which source is active. `loading="lazy"`, `decoding="async"`.
- Initials fallback is a `<div>` with the hashed background color, app initials centered in serif font (matches existing brand type).

## Curated map (sample, full list in implementation)

```ts
export const APP_DOMAINS: Record<string, string> = {
  "PhonePe": "phonepe.com",
  "Google Pay": "pay.google.com",
  "Paytm": "paytm.com",
  "Navi": "navi.com",
  "super.money": "super.money",
  "BHIM": "bhimupi.org.in",
  "CRED": "cred.club",
  "WhatsApp": "whatsapp.com",
  "Amazon Pay": "amazon.in",
  "MobiKwik": "mobikwik.com",
  "Slice": "sliceit.com",
  "Groww": "groww.in",
  "Jupiter Money": "jupiter.money",
  "Fi Money": "fi.money",
  // ...all major banks (SBI, HDFC, ICICI, Axis, Kotak, IDFC First, Yes, RBL, Federal, Canara, BoB, PNB, IndusInd, etc.)
  // ...fintechs (FamPay, KreditBee, Money View, Ind Money, BharatPe, Flipkart, Tata Neu, Bajaj Finserv, Samsung Pay, etc.)
};
```

Unmapped apps (long-tail, "Others") cleanly fall back to initials — no broken-image icons.

## Integration points

Replace plain app-name renderings with `<AppLogo app={name} /> <AppLink app={name} />` in:
- `src/routes/dashboard.index.tsx` — leaders list / top cards
- `src/routes/dashboard.trends.tsx` — Rankings & Movers strip, quadrant labels
- `src/routes/dashboard.data.tsx` — first column of the table
- `src/routes/dashboard.app.$appName.tsx` — hero (large 64px logo next to the app name) and neighbors list

No data-fetching or schema changes; all logos load from `<img>` on the client.

## Out of scope

- Self-hosting logos in `public/logos/` (would require manual asset collection for 90+ brands)
- Background scraping or build-time logo download (not needed; the favicon CDN is reliable)
- Light/dark logo variants
