-- Simplify circulars search: drop the NL/full-text (websearch_to_tsquery +
-- ts_rank_cd) ranking from search_circulars and replace it with a plain
-- case-insensitive substring match on the OC name (title), file name, and
-- content text. Keeps the same call signature AND return row shape the
-- frontend already uses (supabase.rpc("search_circulars", ...)) — including
-- the "rank" column, now always 0 since it's unused by the frontend — so
-- this stays a straight CREATE OR REPLACE with no DROP FUNCTION needed.
-- content_tsv/its GIN index (add_npci_circulars.sql) are left in place, just
-- unused by search now.
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
BEGIN
  RETURN QUERY
  SELECT c.id, c.npci_id, c.oc_number, c.oc_base, c.oc_name, c.file_name,
         c.doc_reference, c.doc_date, c.query_year, c.ocr_status,
         c.content_text, c.storage_path, c.source_url,
         c.summary->>'category' AS summary_category,
         c.summary->'action_items' AS summary_action_items,
         0::real AS rank
  FROM npci_circulars c
  WHERE (c.oc_name ILIKE '%' || search_query || '%'
         OR c.file_name ILIKE '%' || search_query || '%'
         OR c.content_text ILIKE '%' || search_query || '%')
    AND (filter_year IS NULL
         OR (c.doc_date >= make_date(filter_year, 1, 1)
             AND c.doc_date < make_date(filter_year + 1, 1, 1))
         OR (c.doc_date IS NULL AND c.query_year = filter_year))
    AND (filter_category IS NULL OR c.summary->>'category' = filter_category)
  ORDER BY c.doc_date DESC NULLS LAST
  LIMIT page_size OFFSET page_offset;
END
$$;
