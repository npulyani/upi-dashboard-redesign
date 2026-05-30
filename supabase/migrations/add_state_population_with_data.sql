-- Run this in the Supabase Dashboard → SQL Editor
-- Creates upi_state_population and seeds 2021 projected population for all 36 states/UTs.
-- Population is in millions (matching volume_in_mn units in upi_statewise_data).
-- Source: Census 2011 projected to 2021 via SRS / Niti Aayog estimates.

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

INSERT INTO upi_state_population (state_union_territory, population_mn) VALUES
  ('UTTAR PRADESH',                             235.69),
  ('MAHARASHTRA',                               126.39),
  ('BIHAR',                                     128.50),
  ('WEST BENGAL',                               100.93),
  ('MADHYA PRADESH',                             87.00),
  ('RAJASTHAN',                                  81.03),
  ('TAMIL NADU',                                 78.80),
  ('GUJARAT',                                    70.49),
  ('KARNATAKA',                                  67.56),
  ('ANDHRA PRADESH',                             53.90),
  ('ODISHA',                                     46.36),
  ('JHARKHAND',                                  39.10),
  ('TELANGANA',                                  38.50),
  ('KERALA',                                     36.03),
  ('ASSAM',                                      34.38),
  ('DELHI',                                      32.94),
  ('PUNJAB',                                     31.15),
  ('HARYANA',                                    29.34),
  ('CHHATTISGARH',                               29.72),
  ('UTTARAKHAND',                                11.52),
  ('HIMACHAL PRADESH',                            7.30),
  ('JAMMU AND KASHMIR',                          14.00),
  ('LADAKH',                                      0.30),
  ('TRIPURA',                                     4.32),
  ('MEGHALAYA',                                   3.56),
  ('MANIPUR',                                     3.22),
  ('NAGALAND',                                    2.19),
  ('ARUNACHAL PRADESH',                           1.68),
  ('GOA',                                         1.59),
  ('MIZORAM',                                     1.29),
  ('CHANDIGARH',                                  1.16),
  ('PUDUCHERRY',                                  1.73),
  ('SIKKIM',                                      0.68),
  ('ANDAMAN & NICOBAR',                           0.42),
  ('DADRA & NAGAR HAVELI & DAMAN & DIU',          0.59),
  ('LAKSHADWEEP',                                 0.07)
ON CONFLICT (state_union_territory) DO UPDATE SET population_mn = EXCLUDED.population_mn;
