-- Dimension table: MCC codes with stable attributes (type, description)
CREATE TABLE IF NOT EXISTS upi_mcc_codes (
  id          bigserial   PRIMARY KEY,
  mcc         text        NOT NULL UNIQUE,  -- "5814", "Others", etc.
  type        text        NOT NULL,
  description text        NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE upi_mcc_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON upi_mcc_codes FOR SELECT USING (true);

-- Fact table: monthly volume/value per MCC
CREATE TABLE IF NOT EXISTS upi_mcc_data (
  id          bigserial   PRIMARY KEY,
  mcc_id      bigint      NOT NULL REFERENCES upi_mcc_codes(id),
  year        int         NOT NULL,
  month       text        NOT NULL,
  month_num   int         NOT NULL,
  volume_mn   numeric,
  value_cr    numeric,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (mcc_id, year, month_num)
);

CREATE INDEX idx_mcc_data_year_month ON upi_mcc_data (year, month_num);
CREATE INDEX idx_mcc_data_mcc_trend  ON upi_mcc_data (mcc_id, year, month_num);

ALTER TABLE upi_mcc_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON upi_mcc_data FOR SELECT USING (true);
