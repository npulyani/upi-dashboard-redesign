-- Email subscribers for NPCI circular notifications (see
-- docs/circulars-email-subscription-plan.md). Rows are written ONLY by the
-- interactive server (server/, deployed on Railway) using the service-role
-- key, and read by the email send step in the ingest pipeline.
--
-- RLS is enabled with deliberately NO policies: this is the first private
-- (PII) table in the project and the anon key must see nothing. Unlike the
-- upi_statewise_data incident, the absence of a public-read policy here is
-- intentional — do not "fix" it. The service role bypasses RLS.
CREATE TABLE IF NOT EXISTS circular_subscribers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text NOT NULL, -- stored lower-cased by the server
  company         text NOT NULL,
  role            text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'unsubscribed', 'bounced')),
  -- Per-subscriber secret used in both the confirm and unsubscribe links.
  -- Regenerated when an unsubscribed/bounced address re-subscribes.
  token           uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  -- Last Resend webhook event (bounce/complaint) that touched this row.
  last_event_at   timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_circular_subscribers_email
  ON circular_subscribers (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_circular_subscribers_token
  ON circular_subscribers (token);
CREATE INDEX IF NOT EXISTS idx_circular_subscribers_status
  ON circular_subscribers (status);

ALTER TABLE circular_subscribers ENABLE ROW LEVEL SECURITY;
-- No CREATE POLICY statements: intentional (see header comment).
