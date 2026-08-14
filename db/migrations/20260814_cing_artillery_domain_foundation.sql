BEGIN;

-- =====================================================
-- CING ARTILLERY — DOMAIN FOUNDATION
--
-- Scope:
--   account identity only
--   no character
--   no inventory
--   no cosmetics
--   no matchmaking
--   no ranking
--   no economy
--   no public exposure
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cing_artillery_accounts (
  id uuid PRIMARY KEY,

  user_id text NOT NULL,

  status text NOT NULL
    DEFAULT 'active',

  created_at timestamptz NOT NULL
    DEFAULT now(),

  updated_at timestamptz NOT NULL
    DEFAULT now(),

  CONSTRAINT cing_artillery_accounts_user_id_nonempty_check
    CHECK (
      btrim(user_id) <> ''
    ),

  CONSTRAINT cing_artillery_accounts_status_check
    CHECK (
      status IN (
        'active',
        'suspended',
        'closed'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_accounts_user_id_uidx
ON public.cing_artillery_accounts (
  user_id
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_accounts_status_idx
ON public.cing_artillery_accounts (
  status
);

-- Game remains dark until explicitly enabled.
INSERT INTO public.feature_flags (
  key,
  enabled
)
SELECT
  'cing_artillery_enabled',
  false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.feature_flags
  WHERE key = 'cing_artillery_enabled'
);

COMMIT;
