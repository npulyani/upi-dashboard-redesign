-- Add district column (empty string = state-level / total row, non-empty = district-level row)
ALTER TABLE upi_statewise_data ADD COLUMN IF NOT EXISTS district text NOT NULL DEFAULT '';

-- Drop the old 3-column unique constraint
ALTER TABLE upi_statewise_data DROP CONSTRAINT IF EXISTS upi_statewise_data_year_month_state_union_territory_key;

-- New 4-column unique constraint that covers both statewise and district-level rows
ALTER TABLE upi_statewise_data ADD CONSTRAINT upi_statewise_data_unique
  UNIQUE (year, month, state_union_territory, district);
