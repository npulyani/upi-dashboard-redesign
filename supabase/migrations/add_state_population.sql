-- State/UT population data (2021 projected from Census 2011)
CREATE TABLE IF NOT EXISTS upi_state_population (
  id bigserial PRIMARY KEY,
  state_union_territory text NOT NULL UNIQUE,
  population_mn numeric(8,3) NOT NULL,
  census_year integer NOT NULL DEFAULT 2021,
  source text NOT NULL DEFAULT 'Census 2011 projected to 2021 (SRS / Niti Aayog)',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE upi_state_population ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON upi_state_population FOR SELECT USING (true);
