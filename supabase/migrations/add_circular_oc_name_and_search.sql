-- Circulars UX round 2: human-readable circular names + natural-language search.
--
-- oc_name is the circular's title, parsed from the "Subject:" line of the
-- OCR'd body. scripts/backfill_oc_names.mjs backfills existing rows;
-- scripts/ocr_npci_circulars.mjs fills it for newly OCR'd rows going forward.
ALTER TABLE npci_circulars ADD COLUMN IF NOT EXISTS oc_name text;

-- Ranked natural-language search over circular content, called from the
-- frontend via supabase.rpc("search_circulars", ...).
--
-- Two-tier matching: documents matching the strict websearch interpretation
-- (all terms, quoted phrases respected) rank above documents matching any
-- term, and ts_rank_cd orders within each tier, newest-first as a tiebreak.
-- Loose matches are always included (not just when strict finds nothing):
-- with a conversational query like "rules for revoking autopay mandates",
-- one lucky document containing every term must not hide the several that
-- match the terms that matter.
CREATE OR REPLACE FUNCTION search_circulars(
  search_query text,
  filter_year  int DEFAULT NULL,
  page_offset  int DEFAULT 0,
  page_size    int DEFAULT 20
)
RETURNS TABLE (
  id            bigint,
  npci_id       bigint,
  oc_number     text,
  oc_base       text,
  oc_name       text,
  file_name     text,
  doc_reference text,
  doc_date      date,
  query_year    int,
  ocr_status    text,
  content_text  text,
  storage_path  text,
  source_url    text,
  rank          real
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
         ts_rank_cd(c.content_tsv, rank_q) AS rank
  FROM npci_circulars c
  WHERE (c.content_tsv @@ strict_q OR c.content_tsv @@ loose_q)
    AND (filter_year IS NULL
         OR (c.doc_date >= make_date(filter_year, 1, 1)
             AND c.doc_date < make_date(filter_year + 1, 1, 1))
         OR (c.doc_date IS NULL AND c.query_year = filter_year))
  ORDER BY (c.content_tsv @@ strict_q) DESC,
           ts_rank_cd(c.content_tsv, rank_q) DESC,
           c.doc_date DESC NULLS LAST
  LIMIT page_size OFFSET page_offset;
END
$$;
