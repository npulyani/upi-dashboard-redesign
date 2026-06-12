-- Performance indexes matching the app's actual query shapes.
-- Apply manually (same workflow as other migrations in this folder).

-- Per-month app query: getMonthData filters (year, month) with cit_volume_mn > 0
create index if not exists idx_monthly_year_month
  on upi_monthly_data (year, month_num, month)
  where cit_volume_mn > 0;

-- Statewise per-month: getStatewiseData filters (year, month), orders volume desc
create index if not exists idx_statewise_year_month
  on upi_statewise_data (year, month, volume_in_mn desc);

-- State trend + unique states: filters state, district = '', orders (year, month_num)
create index if not exists idx_statewise_state_trend
  on upi_statewise_data (state_union_territory, year, month_num)
  where district = '';

-- upi_p2p_p2m needs nothing: its UNIQUE (year, month_num) constraint already
-- backs the only access pattern (full ordered scan of ~65 rows).
