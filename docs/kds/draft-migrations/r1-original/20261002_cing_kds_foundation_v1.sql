-- ====================================================
-- CING KDS PRO V1 — DORMANT FOUNDATION
-- DRAFT ONLY — DO NOT EXECUTE IN PRODUCTION
-- No webhook wiring, triggers or public RPCs.
-- ====================================================

CREATE TABLE IF NOT EXISTS public.cing_kds_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_parent text NOT NULL,
  pos_id bigint NOT NULL,
  tran_id text NOT NULL,
  tran_no text,
  pos_name text,
  source_event_id text,
  payment_verification text NOT NULL
    DEFAULT 'pending_verification'
    CHECK (payment_verification IN (
      'pending_verification',
      'verified',
      'rejected'
    )),
  tran_date_raw text,
  hub_created_at_raw text,
  event_timestamp timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pos_parent, tran_id)
);

CREATE TABLE IF NOT EXISTS public.cing_kds_cups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
    REFERENCES public.cing_kds_orders(id),
  unit_key text NOT NULL,
  item_id text NOT NULL,
  item_name text NOT NULL,
  item_group text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'preparing',
      'prepared',
      'served'
    )),
  version bigint NOT NULL DEFAULT 0
    CHECK (version >= 0),
  prepared_at timestamptz,
  served_at timestamptz,
  UNIQUE (order_id, unit_key)
);

CREATE TABLE IF NOT EXISTS public.cing_kds_cup_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cup_id uuid NOT NULL
    REFERENCES public.cing_kds_cups(id),
  action_key text NOT NULL,
  actor_id text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  previous_version bigint NOT NULL,
  new_version bigint NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cup_id, action_key)
);

CREATE TABLE IF NOT EXISTS public.cing_kds_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_parent text NOT NULL,
  pos_id bigint NOT NULL,
  warning_minutes integer NOT NULL
    CHECK (warning_minutes > 0),
  critical_minutes integer NOT NULL
    CHECK (critical_minutes > warning_minutes),
  enabled boolean NOT NULL DEFAULT false,
  UNIQUE (pos_parent, pos_id)
);

CREATE TABLE IF NOT EXISTS public.cing_kds_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
    REFERENCES public.cing_kds_orders(id),
  severity text NOT NULL
    CHECK (severity IN ('warning', 'critical')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN (
      'active',
      'acknowledged',
      'resolved'
    )),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (order_id, severity)
);

-- Closed client access by default.
-- Authorized backend access will be designed separately.

ALTER TABLE public.cing_kds_orders
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cing_kds_cups
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cing_kds_cup_audit
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cing_kds_sla_policies
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cing_kds_alerts
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cing_kds_orders
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cing_kds_cups
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cing_kds_cup_audit
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cing_kds_sla_policies
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cing_kds_alerts
  FROM PUBLIC, anon, authenticated;

-- No RLS policies.
-- No client EXECUTE grants.
-- No production cutover.
