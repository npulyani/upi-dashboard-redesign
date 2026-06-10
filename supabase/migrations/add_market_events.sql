-- Curated UPI market events (regulatory actions, corporate moves, product launches, policy changes)
-- Source of truth lives in src/lib/upi/market-events.json; this table lets events be
-- updated between deploys. Seed with: node scripts/seed_market_events.mjs
CREATE TABLE IF NOT EXISTS market_events (
  id bigserial PRIMARY KEY,
  event_date date NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('regulatory', 'corporate', 'product', 'policy')),
  apps_affected text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (event_date, title)
);

ALTER TABLE market_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON market_events FOR SELECT USING (true);
