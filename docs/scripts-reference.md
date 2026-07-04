# Scripts reference

All scripts live in `scripts/`, read credentials from `.env.local`, and support `--dry-run` unless noted otherwise (the two backfill scripts default to dry-run for safety since they rewrite live data).

## App/monthly data

- **`fetch_upi_apps.mjs`** — fetches UPI app-wise monthly data from NPCI, fuzzy-matches app names against existing `upi_apps`, upserts `upi_monthly_data`, and writes a local `public/data/{year}-{month}.json` cache. Takes `--year`/`--month`. Single-month only; no bulk variant (history was built up incrementally, one month at a time).
- **`fetch_statewise.mjs`** — per-month update: fetches statewise/district UPI stats for one month into `upi_statewise_data`. Takes `--year`/`--month`, defaults to the latest month.
- **`fetch_statewise_all.mjs`** — bulk backfill: same as above but loops the full Jan 2021 → latest range in one run.
- **`fetch_p2p_p2m.mjs`** — per-month update: fetches the P2P/P2M transaction split for one month into `upi_p2p_p2m`; cross-validates internally (P2P+P2M ≈ total) and against `upi_monthly_data`. Takes `--year`/`--month`, defaults to the latest month.
- **`fetch_p2p_p2m_all.mjs`** — bulk backfill: same as above but loops the full Jan 2021 → latest range in one run.
- **`fetch_mcc.mjs`** — per-month merchant-category (MCC) update into `upi_mcc_codes`/`upi_mcc_data`. Takes `--year`/`--month`.
- **`fetch_mcc_all.mjs`** — bulk backfill of MCC data for all months at once.

All four `fetch_statewise*`/`fetch_p2p_p2m*`/`fetch_mcc*` scripts follow the same convention: the plain name is the single-month incremental updater (what you run each monthly cycle), `_all` is the full-history bulk backfill (rarely needed after initial setup). The bulk variants have a hardcoded end date (`y === 2026 ? 5 : 12`) that must be bumped by hand alongside the other monthly-update steps.

## Circulars pipeline (run in this order)

1. **`fetch_npci_circulars.mjs`** — pulls circular metadata + PDFs from NPCI into Storage, upserts `npci_circulars` rows as `ocr_status='pending'`. Prints new-circular names and the remaining pipeline steps as a reminder.
2. **`ocr_npci_circulars.mjs`** — sends each pending PDF to Claude for OCR, writes `content_text`. Resumable, supports `--retry-failed`.
3. **`summarize_npci_circulars.mjs`** — asks Claude for a structured summary (TL;DR, category, action items) from the OCR'd text, writes `summary`. Resumable, `--retry-failed`.
4. **`build_circulars_search_corpus.mjs`** — uploads the client-side search corpus (all circular rows as JSON) to Supabase Storage for the in-browser MiniSearch feature. Must be re-run after new circulars are added or they won't be searchable.

## Circulars one-off/support scripts

- **`backfill_oc_names.mjs`** — one-off: derives `oc_name` (human title) for existing rows by parsing the "Subject:" line. Dry-run by default.
- **`backfill_oc_numbers.mjs`** — one-off: re-derives `oc_number`/`oc_base` for existing rows using the improved `parseOc()`. Dry-run by default.
- **`extractSubject.mjs`** — shared helper: extracts the subject/title from OCR'd text via 3 fallback strategies (used by the backfill script and `ocr_npci_circulars.mjs`).
- **`parseOc.mjs`** — shared helper: regex-parses an "OC ###" reference number out of free text (filename or OCR'd body).

## Seeding (one-off setup scripts)

- **`seed_market_events.mjs`** — seeds `market_events` from the curated `src/lib/upi/market-events.json`.
- **`seed_population.mjs`** — seeds `upi_state_population` with 2021 state/UT population figures.
