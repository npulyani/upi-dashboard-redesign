# Smart Actionable Summary for NPCI Circulars — Plan

Status: **planned** (not started). Written 2026-07-02.

## Goal

Every circular detail page opens with a structured, AI-generated "what this
means and what you must do" card, instead of forcing the reader to parse a
scanned-letter transcription. The same structured data powers deadline chips
and category badges in the list, and cross-links between circulars.

This is the "AI summary" item deferred from the circulars v1 ship
(2026-07-01), upgraded from a plain prose summary to an actionable one.

## Data model

New columns on `npci_circulars` (single migration, manual apply as usual):

```sql
ALTER TABLE npci_circulars
  ADD COLUMN IF NOT EXISTS summary        jsonb,        -- structured payload below
  ADD COLUMN IF NOT EXISTS summary_model  text,          -- e.g. "claude-sonnet-4-6"
  ADD COLUMN IF NOT EXISTS summary_at     timestamptz,
  ADD COLUMN IF NOT EXISTS summary_status text NOT NULL DEFAULT 'pending';  -- pending | done | failed | skipped
```

Columns-on-table (not a separate table) matches how `content_text`/OCR fields
already live; versioning is handled by re-running the batch with a newer
model, which overwrites in place.

### `summary` JSON shape (enforced via structured output `json_schema`)

```jsonc
{
  "tldr": "2–3 sentence plain-English summary of what changed and why.",
  "category": "limits | mandates/autopay | security/fraud | merchant/P2M | onboarding | technical/API | compliance/penalty | international | product-launch | other",
  "audience": ["banks", "psps", "tpaps", "merchants", "aggregators"],
  "effective_date": "2026-01-31 | null",
  "action_items": [
    {
      "action": "Enable MCC 5412 blocking for collect requests",
      "owner": "acquiring banks",
      "deadline": "2022-11-10 | null"
    }
  ],
  "references": ["OC 141", "OC 141A"],   // other circulars cited in the body
  "supersedes_note": "Extends OC 97 compliance timeline by 2 years | null"
}
```

`references` uses the same `OC <n><letter?>` normalization as
`scripts/parseOc.mjs` so the UI can link them via `oc_base` lookups.

## Batch script — `scripts/summarize_npci_circulars.mjs`

Pattern-matched to `ocr_npci_circulars.mjs` (same env loader, resumable,
per-row failure recording, `--limit / --oc / --retry-failed / --dry-run`):

- Input: `content_text` (already OCR'd — no PDF round-trip needed).
- Rows with `ocr_status != 'done'` or very short text → `summary_status = 'skipped'`.
- Model: `claude-sonnet-4-6` (structured extraction with judgment calls —
  deadlines vs. dates-in-passing — is worth the step up from Haiku; ~240 docs
  × ~4k input tokens ≈ low single-digit dollars for the full backfill).
- Prompt guardrails: summaries must only state what the circular says; when no
  action is required (informational circulars), `action_items: []` — the model
  must not invent obligations. Deadline strings must appear in the source text.
- Monthly-update workflow gains step 5: run fetch → OCR → summarize (the
  summarize step picks up `summary_status = 'pending'` rows automatically).

## UI

Phase A — detail page (`dashboard.circulars.$ocNumber.tsx`):
- "Smart summary" BentoCard above the full text: TL;DR paragraph, audience +
  category chips, "Effective from" chip, and an action checklist where each
  item shows owner + deadline (red-tinted when the deadline is in the future
  at view time, muted when historical).
- References render as links to `/dashboard/circulars/<oc>` (resolve via
  existing `circularRouteKey`; addenda land on the parent's `oc_base`).
- Clear AI provenance line: "Summarized by Claude from the circular text —
  verify against the original PDF." + `summary_model`.
- Analytics: `circular_summary_viewed`, `circular_reference_clicked`.

Phase B — list page:
- Category badge + "action required" / deadline chip on `CircularListItem`
  (needs `summary->>'category'`, `summary->'action_items'` in the list
  select — pull only those two keys, not the whole jsonb, to keep the
  paginated payload small).
- Optional category filter pills next to the year pills.

## Sequencing

1. Migration + batch script + backfill run (verifiable in SQL only).
2. Phase A detail card.
3. Phase B list badges + category filter.

## Later / related

- **Semantic search upgrade**: once a batch-LLM pipeline exists, the same
  script pattern can embed `content_text` chunks (pgvector column + edge
  function for query-time embedding) and hybrid-rank with the existing
  `search_circulars` FTS. Deferred: FTS + OR-fallback shipped 2026-07-02 is
  good enough until queries demonstrably miss.
- **"What changed this month" digest**: monthly roll-up of new circulars'
  TL;DRs on the Overview page.
