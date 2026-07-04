-- Circulars keyword search moved fully client-side (2026-07): the frontend
-- downloads a corpus JSON from Storage (built by
-- scripts/build_circulars_search_corpus.mjs) and searches it in-browser with
-- MiniSearch (src/lib/upi/circularsSearch.ts). The search_circulars RPC is no
-- longer called, so drop it — including the stale 4-param overload left
-- behind when add_npci_circular_summaries.sql added filter_category (CREATE
-- OR REPLACE with a different signature creates an overload rather than
-- replacing, and the pair made PostgREST error with PGRST203 ambiguity for
-- callers not passing every argument).
--
-- content_tsv and its GIN index (add_npci_circulars.sql) are deliberately
-- kept: cheap, and they preserve the option of a server-side fallback.
DROP FUNCTION IF EXISTS search_circulars(text, int, int, int);
DROP FUNCTION IF EXISTS search_circulars(text, int, int, int, text);
