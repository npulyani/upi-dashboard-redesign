-- Per-subscriber send log for circular notification emails. One row = one
-- successfully sent email (circular × subscriber), written by the server's
-- POST /api/notify-circulars endpoint after each Resend accept. Makes the
-- notify step idempotent and resumable: re-calls (the ingest Action invokes
-- it unconditionally every run) only email pairs not yet recorded here, so
-- an interrupted send picks up where it left off without duplicates.
--
-- Same RLS posture as circular_subscribers: enabled, deliberately NO
-- policies — service-role only, invisible to the anon key.
CREATE TABLE IF NOT EXISTS circular_notifications (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  circular_id   bigint NOT NULL REFERENCES npci_circulars (id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES circular_subscribers (id) ON DELETE CASCADE,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  resend_id     text, -- Resend message id, for tracing bounces back to a send
  UNIQUE (circular_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_circular_notifications_circular
  ON circular_notifications (circular_id);

ALTER TABLE circular_notifications ENABLE ROW LEVEL SECURITY;
-- No CREATE POLICY statements: intentional (see header comment).
