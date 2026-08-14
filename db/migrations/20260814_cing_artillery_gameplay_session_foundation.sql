BEGIN;

-- =====================================================
-- CING ARTILLERY — GAMEPLAY SESSION FOUNDATION
--
-- Scope:
--   durable gameplay-session identity
--   account ownership
--   one active session per account
--   lifecycle timestamps
--
-- No:
--   matchmaking
--   realtime room
--   opponent assignment
--   combat state
--   turn state
--   score/ranking
--   economy/reward
--   public exposure
--
-- PostgreSQL is the final concurrency authority.
-- =====================================================

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_gameplay_sessions (
    id uuid PRIMARY KEY,

    account_id uuid NOT NULL
      REFERENCES public.cing_artillery_accounts(id)
      ON DELETE CASCADE,

    status text NOT NULL
      DEFAULT 'active',

    started_at timestamptz NOT NULL
      DEFAULT now(),

    ended_at timestamptz,

    created_at timestamptz NOT NULL
      DEFAULT now(),

    updated_at timestamptz NOT NULL
      DEFAULT now(),

    CONSTRAINT
      cing_artillery_gameplay_sessions_status_check
      CHECK (
        status IN (
          'active',
          'completed',
          'abandoned'
        )
      ),

    CONSTRAINT
      cing_artillery_gameplay_sessions_lifecycle_check
      CHECK (
        (
          status = 'active'
          AND ended_at IS NULL
        )
        OR
        (
          status IN (
            'completed',
            'abandoned'
          )
          AND ended_at IS NOT NULL
        )
      )
  );

-- Exactly one active gameplay session may exist
-- for one Cing Artillery account.
--
-- This is intentionally enforced at database level so
-- concurrent application requests cannot create duplicate
-- active sessions.
CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_gameplay_sessions_account_active_uidx
ON public.cing_artillery_gameplay_sessions (
  account_id
)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS
  cing_artillery_gameplay_sessions_account_started_idx
ON public.cing_artillery_gameplay_sessions (
  account_id,
  started_at DESC
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_gameplay_sessions_status_idx
ON public.cing_artillery_gameplay_sessions (
  status
);

COMMIT;
