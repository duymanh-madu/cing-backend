BEGIN;

-- =====================================================
-- CRM / iPOS POINT HISTORY — DURABLE IDEMPOTENCY
--
-- One external CRM/iPOS event may create at most one
-- point-ledger transition for one canonical user.
--
-- Legacy point-history rows do not contain crm_event_id
-- and are intentionally outside this uniqueness contract.
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  analytics_events_crm_point_event_uidx
ON public.analytics_events (
  user_id,
  ((event_data ->> 'crm_event_id'))
)
WHERE
  user_id IS NOT NULL
  AND event_name IN (
    'points_added',
    'points_deducted'
  )
  AND COALESCE(
    event_data ->> 'crm_event_id',
    ''
  ) <> '';

COMMIT;
