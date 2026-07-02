-- NPCI UPI/RuPay operating circulars: document metadata + OCR'd full text.
-- Populated by scripts/fetch_npci_circulars.mjs (metadata + PDF download) and
-- scripts/ocr_npci_circulars.mjs (Claude-vision OCR of the scanned PDFs).
--
-- PDFs themselves live in the Supabase Storage bucket "circulars"; this table
-- holds the metadata, the parsed OC reference number, and the searchable text.
CREATE TABLE IF NOT EXISTS npci_circulars (
  id            bigserial   PRIMARY KEY,
  npci_id       bigint      NOT NULL UNIQUE,    -- NPCI API record id (stable upsert key)
  oc_number     text,                           -- parsed reference, e.g. "OC 193A"
  oc_base       text,                           -- "OC 193" (groups a circular with its addenda)
  file_name     text        NOT NULL,
  media_type    text,                           -- "pdf"
  year_label    text,                           -- API financial-year label, e.g. "FY 25-26"
  query_year    int,                            -- calendar year used in the API call
  source_url    text,                           -- original NPCI URL
  storage_path  text,                           -- path within the "circulars" storage bucket
  doc_reference text,                           -- authoritative ref from OCR body, e.g. "NPCI/UPI/OC 193A/2024-25"
  doc_date      date,                           -- date parsed from the OCR body (nullable)
  content_text  text,                           -- OCR'd full text
  content_tsv   tsvector GENERATED ALWAYS AS (
                  to_tsvector('english', coalesce(content_text, '') || ' ' || coalesce(file_name, ''))
                ) STORED,
  page_count    int,
  ocr_status    text        NOT NULL DEFAULT 'pending',  -- pending | done | failed
  ocr_error     text,
  fetched_at    timestamptz DEFAULT now(),
  ocr_at        timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_npci_circulars_tsv    ON npci_circulars USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS idx_npci_circulars_ocnum  ON npci_circulars (oc_number);
CREATE INDEX IF NOT EXISTS idx_npci_circulars_status ON npci_circulars (ocr_status);

ALTER TABLE npci_circulars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON npci_circulars FOR SELECT USING (true);
