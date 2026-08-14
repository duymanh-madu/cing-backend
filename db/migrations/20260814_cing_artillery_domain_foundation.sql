BEGIN;

-- =====================================================
-- CING ARTILLERY — DOMAIN FOUNDATION
--
-- Scope:
--   account identity
--   private runtime configuration
--
-- No:
--   character
--   inventory
--   cosmetics
--   matchmaking
--   ranking
--   economy
--   public exposure
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

-- =====================================================
-- PRIVATE GAME CONFIG
--
-- app_configs is the existing production source of truth
-- for application/game configuration.
--
-- Game remains dark until explicitly enabled.
-- =====================================================

ALTER TABLE public.app_configs
  ADD COLUMN IF NOT EXISTS cing_artillery_config jsonb
  NOT NULL
  DEFAULT '{
    "version": 1,
    "enabled": false
  }'::jsonb;

UPDATE public.app_configs
SET cing_artillery_config =
  jsonb_build_object(
    'version',
    COALESCE(
      NULLIF(
        cing_artillery_config->>'version',
        ''
      )::integer,
      1
    ),

    'enabled',
    COALESCE(
      (
        cing_artillery_config->>'enabled'
      )::boolean,
      false
    )
  )
WHERE id = 1;

COMMIT;
