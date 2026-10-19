-- ====================================================
-- CING KDS PRO V1 — EVENT 11 DURABLE INBOX
-- DORMANT / DRAFT ONLY
-- DO NOT EXECUTE IN PRODUCTION
-- ====================================================

CREATE TABLE public.cing_kds_event_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source text NOT NULL DEFAULT 'ipos_event_11'
    CHECK (source = 'ipos_event_11'),

  pos_parent text NOT NULL,
  pos_id bigint NOT NULL CHECK (pos_id > 0),
  tran_id text NOT NULL,

  source_event_id text,

  fingerprint text NOT NULL
    CHECK (fingerprint ~ '^[0-9a-f]{64}$'),

  -- Sanitized operational data only.
  -- Raw CRM/payment credentials are not stored.
  event_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(event_snapshot) = 'object'),

  payment_verification text NOT NULL
    DEFAULT 'pending_verification'
    CHECK (payment_verification IN (
      'pending_verification',
      'verified',
      'rejected'
    )),

  ingestion_status text NOT NULL DEFAULT 'pending'
    CHECK (ingestion_status IN (
      'pending',
      'processed',
      'review_required'
    )),

  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,

  UNIQUE (pos_parent, tran_id)
);

CREATE INDEX cing_kds_event_inbox_pending_idx
ON public.cing_kds_event_inbox (
  ingestion_status,
  received_at
);

ALTER TABLE public.cing_kds_event_inbox
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cing_kds_event_inbox
FROM PUBLIC, anon, authenticated;

-- No client policies.
-- No backend writer enabled.
-- No trigger or runtime connection.
-- No production cutover.
