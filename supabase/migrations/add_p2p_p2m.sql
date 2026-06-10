CREATE TABLE IF NOT EXISTS upi_p2p_p2m (
  id               bigserial   PRIMARY KEY,
  year             int         NOT NULL,
  month            text        NOT NULL,
  month_num        int         NOT NULL,
  total_volume_mn  numeric     NOT NULL,
  total_value_cr   numeric     NOT NULL,
  p2p_volume_mn    numeric     NOT NULL,
  p2p_value_cr     numeric     NOT NULL,
  p2m_volume_mn    numeric     NOT NULL,
  p2m_value_cr     numeric     NOT NULL,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (year, month_num)
);

ALTER TABLE upi_p2p_p2m ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON upi_p2p_p2m FOR SELECT USING (true);
