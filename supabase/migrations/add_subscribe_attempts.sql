-- Per-IP attempt log backing the rate limit on POST /api/subscribe (server/).
-- The server runs on Vercel serverless, where instances share no memory, so
-- the limiter counts rows here instead of keeping an in-process Map. Only a
-- keyed HMAC of the client IP is stored — never the address itself.
--
-- Same posture as circular_subscribers: RLS enabled with deliberately NO
-- policies, so only the server's service-role key can touch it. The server
-- also prunes rows older than a day on ~2% of calls.
CREATE TABLE IF NOT EXISTS subscribe_attempts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscribe_attempts_ip_created
  ON subscribe_attempts (ip_hash, created_at DESC);

ALTER TABLE subscribe_attempts ENABLE ROW LEVEL SECURITY;
-- No CREATE POLICY statements: intentional (see header comment).
