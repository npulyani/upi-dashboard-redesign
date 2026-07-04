-- Statewise UPI statistics per month (source: NPCI ecosystem-statistics API)
CREATE TABLE IF NOT EXISTS upi_statewise_data (
  id                    bigserial PRIMARY KEY,
  year                  integer NOT NULL,
  month                 text NOT NULL,
  month_num             integer NOT NULL,
  state_union_territory text NOT NULL,
  volume_in_mn          numeric(12,2),
  value_in_cr           numeric(14,2),
  volume_contribution   numeric(6,3),
  value_contribution    numeric(6,3),
  created_at            timestamptz DEFAULT now(),
  UNIQUE (year, month, state_union_territory)
);

ALTER TABLE upi_statewise_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON upi_statewise_data;
CREATE POLICY "public read" ON upi_statewise_data FOR SELECT USING (true);
