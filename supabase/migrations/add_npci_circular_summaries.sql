-- Smart actionable summaries for NPCI circulars (see
-- docs/circular-smart-summary-plan.md). Populated by
-- scripts/summarize_npci_circulars.mjs from the already-OCR'd content_text —
-- structured TL;DR / category / audience / action items / references.
ALTER TABLE npci_circulars
  ADD COLUMN IF NOT EXISTS summary        jsonb,
  ADD COLUMN IF NOT EXISTS summary_model  text,
  ADD COLUMN IF NOT EXISTS summary_at     timestamptz,
  ADD COLUMN IF NOT EXISTS summary_status text NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_npci_circulars_summary_status ON npci_circulars (summary_status);

-- search_circulars (add_circular_oc_name_and_search.sql) needs the two list-
-- page summary keys added to its fixed RETURNS TABLE so keyword-search
-- results also carry the category badge / deadline chip.
CREATE OR REPLACE FUNCTION search_circulars(
  search_query    text,
  filter_year     int DEFAULT NULL,
  page_offset     int DEFAULT 0,
  page_size       int DEFAULT 20,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id                    bigint,
  npci_id               bigint,
  oc_number             text,
  oc_base               text,
  oc_name               text,
  file_name             text,
  doc_reference         text,
  doc_date              date,
  query_year            int,
  ocr_status            text,
  content_text          text,
  storage_path          text,
  source_url            text,
  summary_category      text,
  summary_action_items  jsonb,
  rank                  real
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  strict_q tsquery := websearch_to_tsquery('english', search_query);
  -- OR'd variant of the same terms. For quoted-phrase queries the injected
  -- "or" lands inside the phrase and breaks it — harmless, since strict_q
  -- still carries the intact phrase and the WHERE tries both.
  loose_q  tsquery := websearch_to_tsquery('english', regexp_replace(trim(search_query), '\s+', ' or ', 'g'));
  rank_q   tsquery;
BEGIN
  -- Stopword-only queries parse to empty tsqueries: no results, not an error.
  -- (An empty tsquery matches nothing, so @@ below is safe either way.)
  IF numnode(strict_q) = 0 AND numnode(loose_q) = 0 THEN
    RETURN;
  END IF;
  rank_q := CASE WHEN numnode(loose_q) > 0 THEN loose_q ELSE strict_q END;

  RETURN QUERY
  SELECT c.id, c.npci_id, c.oc_number, c.oc_base, c.oc_name, c.file_name,
         c.doc_reference, c.doc_date, c.query_year, c.ocr_status,
         c.content_text, c.storage_path, c.source_url,
         c.summary->>'category' AS summary_category,
         c.summary->'action_items' AS summary_action_items,
         ts_rank_cd(c.content_tsv, rank_q) AS rank
  FROM npci_circulars c
  WHERE (c.content_tsv @@ strict_q OR c.content_tsv @@ loose_q)
    AND (filter_year IS NULL
         OR (c.doc_date >= make_date(filter_year, 1, 1)
             AND c.doc_date < make_date(filter_year + 1, 1, 1))
         OR (c.doc_date IS NULL AND c.query_year = filter_year))
    AND (filter_category IS NULL OR c.summary->>'category' = filter_category)
  ORDER BY (c.content_tsv @@ strict_q) DESC,
           ts_rank_cd(c.content_tsv, rank_q) DESC,
           c.doc_date DESC NULLS LAST
  LIMIT page_size OFFSET page_offset;
END
$$;
