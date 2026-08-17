BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- TERMINAL MATCH LIFECYCLE FOUNDATION
--
-- Product name:
--   Cing Piu Piu
--
-- Technical namespace intentionally remains:
--   cing_artillery_*
--
-- Purpose:
--
--   establish durable terminal lifecycle representation
--   across:
--
--     match
--       ->
--     match runtime
--       ->
--     combat
--       ->
--     current-turn singleton
--
-- This migration defines terminal STATE SHAPE only.
--
-- It intentionally does NOT:
--
--   apply damage
--   decide winner / loser
--   complete a shot execution
--   persist shot resolution
--   advance a turn
--   complete gameplay sessions
--   mutate ranking / economy / rewards
--   emit realtime events
--   expose any public route
--
-- The later fenced Resolution Commit authority will own
-- the atomic HP-depletion transition.
--
-- PostgreSQL remains final durable gameplay authority.
-- =====================================================


-- =====================================================
-- MATCH TERMINAL STATE
--
-- Lifecycle:
--
--   matched
--      ->
--   completed
--
-- For the currently implemented combat-death path the
-- canonical terminal reason is:
--
--   hp_depleted
--
-- Other terminal reasons must be introduced only together
-- with their own authoritative gameplay transition.
-- =====================================================

ALTER TABLE
  public.cing_artillery_matches
ADD COLUMN IF NOT EXISTS
  winner_account_id uuid
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE RESTRICT,

ADD COLUMN IF NOT EXISTS
  loser_account_id uuid
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE RESTRICT,

ADD COLUMN IF NOT EXISTS
  completion_reason text,

ADD COLUMN IF NOT EXISTS
  completed_at timestamptz;


ALTER TABLE
  public.cing_artillery_matches
DROP CONSTRAINT IF EXISTS
  cing_artillery_matches_status_check;

ALTER TABLE
  public.cing_artillery_matches
ADD CONSTRAINT
  cing_artillery_matches_status_check
CHECK (
  status IN (
    'matched',
    'completed'
  )
);


ALTER TABLE
  public.cing_artillery_matches
DROP CONSTRAINT IF EXISTS
  cing_artillery_matches_terminal_lifecycle_check;

ALTER TABLE
  public.cing_artillery_matches
ADD CONSTRAINT
  cing_artillery_matches_terminal_lifecycle_check
CHECK (
  (
    status = 'matched'

    AND winner_account_id IS NULL
    AND loser_account_id IS NULL
    AND completion_reason IS NULL
    AND completed_at IS NULL
  )
  OR
  (
    status = 'completed'

    AND winner_account_id IS NOT NULL
    AND loser_account_id IS NOT NULL

    AND winner_account_id <> loser_account_id

    AND completion_reason =
      'hp_depleted'

    AND completed_at IS NOT NULL
    AND completed_at >= matched_at

    AND (
      (
        winner_account_id =
          player_one_account_id

        AND loser_account_id =
          player_two_account_id
      )
      OR
      (
        winner_account_id =
          player_two_account_id

        AND loser_account_id =
          player_one_account_id
      )
    )
  )
);


-- =====================================================
-- MATCH RUNTIME TERMINAL STATE
--
-- Runtime terminal identity deliberately mirrors match
-- terminal identity.
--
-- The later atomic terminal authority must guarantee that
-- these values equal the canonical match values.
-- =====================================================

ALTER TABLE
  public.cing_artillery_match_runtimes
ADD COLUMN IF NOT EXISTS
  winner_account_id uuid
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE RESTRICT,

ADD COLUMN IF NOT EXISTS
  loser_account_id uuid
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE RESTRICT,

ADD COLUMN IF NOT EXISTS
  completion_reason text,

ADD COLUMN IF NOT EXISTS
  completed_at timestamptz;


ALTER TABLE
  public.cing_artillery_match_runtimes
DROP CONSTRAINT IF EXISTS
  cing_artillery_match_runtimes_status_check;

ALTER TABLE
  public.cing_artillery_match_runtimes
ADD CONSTRAINT
  cing_artillery_match_runtimes_status_check
CHECK (
  status IN (
    'ready',
    'completed'
  )
);


ALTER TABLE
  public.cing_artillery_match_runtimes
DROP CONSTRAINT IF EXISTS
  cing_artillery_match_runtimes_terminal_lifecycle_check;

ALTER TABLE
  public.cing_artillery_match_runtimes
ADD CONSTRAINT
  cing_artillery_match_runtimes_terminal_lifecycle_check
CHECK (
  (
    status = 'ready'

    AND winner_account_id IS NULL
    AND loser_account_id IS NULL
    AND completion_reason IS NULL
    AND completed_at IS NULL
  )
  OR
  (
    status = 'completed'

    AND winner_account_id IS NOT NULL
    AND loser_account_id IS NOT NULL

    AND winner_account_id <> loser_account_id

    AND completion_reason =
      'hp_depleted'

    AND completed_at IS NOT NULL
    AND completed_at >= initialized_at

    AND (
      (
        winner_account_id =
          player_one_account_id

        AND loser_account_id =
          player_two_account_id
      )
      OR
      (
        winner_account_id =
          player_two_account_id

        AND loser_account_id =
          player_one_account_id
      )
    )
  )
);


-- =====================================================
-- COMBAT TERMINAL STATE
--
-- Combat is the gameplay-level terminal authority that
-- will later be transitioned by Resolution Commit.
-- =====================================================

ALTER TABLE
  public.cing_artillery_combat_states
ADD COLUMN IF NOT EXISTS
  winner_account_id uuid
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE RESTRICT,

ADD COLUMN IF NOT EXISTS
  loser_account_id uuid
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE RESTRICT,

ADD COLUMN IF NOT EXISTS
  completion_reason text,

ADD COLUMN IF NOT EXISTS
  completed_at timestamptz;


ALTER TABLE
  public.cing_artillery_combat_states
DROP CONSTRAINT IF EXISTS
  cing_artillery_combat_states_status_check;

ALTER TABLE
  public.cing_artillery_combat_states
ADD CONSTRAINT
  cing_artillery_combat_states_status_check
CHECK (
  status IN (
    'initialized',
    'completed'
  )
);


ALTER TABLE
  public.cing_artillery_combat_states
DROP CONSTRAINT IF EXISTS
  cing_artillery_combat_states_terminal_lifecycle_check;

ALTER TABLE
  public.cing_artillery_combat_states
ADD CONSTRAINT
  cing_artillery_combat_states_terminal_lifecycle_check
CHECK (
  (
    status = 'initialized'

    AND winner_account_id IS NULL
    AND loser_account_id IS NULL
    AND completion_reason IS NULL
    AND completed_at IS NULL
  )
  OR
  (
    status = 'completed'

    AND winner_account_id IS NOT NULL
    AND loser_account_id IS NOT NULL

    AND winner_account_id <> loser_account_id

    AND completion_reason =
      'hp_depleted'

    AND completed_at IS NOT NULL
    AND completed_at >= initialized_at

    AND (
      (
        winner_account_id =
          player_one_account_id

        AND loser_account_id =
          player_two_account_id
      )
      OR
      (
        winner_account_id =
          player_two_account_id

        AND loser_account_id =
          player_one_account_id
      )
    )
  )
);


-- =====================================================
-- TURN TERMINAL STATE
--
-- The turn row is a mutable CURRENT-TURN singleton.
--
-- Terminal combat must leave no participant logically
-- holding an active turn.
--
-- Therefore:
--
--   active
--      ->
--   completed
--
-- preserves:
--
--   final positive turn_number
--   initiative_reason
--
-- and clears:
--
--   active account
--   active session
--   turn start
--   turn deadline
--
-- completed_at becomes the durable terminal timestamp.
-- =====================================================

ALTER TABLE
  public.cing_artillery_turn_states
ADD COLUMN IF NOT EXISTS
  completed_at timestamptz;


ALTER TABLE
  public.cing_artillery_turn_states
DROP CONSTRAINT IF EXISTS
  cing_artillery_turn_states_status_check;

ALTER TABLE
  public.cing_artillery_turn_states
ADD CONSTRAINT
  cing_artillery_turn_states_status_check
CHECK (
  status IN (
    'pending',
    'active',
    'completed'
  )
);


ALTER TABLE
  public.cing_artillery_turn_states
DROP CONSTRAINT IF EXISTS
  cing_artillery_turn_states_lifecycle_check;

ALTER TABLE
  public.cing_artillery_turn_states
ADD CONSTRAINT
  cing_artillery_turn_states_lifecycle_check
CHECK (
  (
    status = 'pending'

    AND turn_number = 0

    AND active_account_id IS NULL
    AND active_session_id IS NULL

    AND turn_started_at IS NULL
    AND turn_deadline_at IS NULL

    AND completed_at IS NULL
  )
  OR
  (
    status = 'active'

    AND turn_number > 0

    AND active_account_id IS NOT NULL
    AND active_session_id IS NOT NULL

    AND turn_started_at IS NOT NULL
    AND turn_deadline_at IS NOT NULL

    AND turn_deadline_at >
      turn_started_at

    AND completed_at IS NULL
  )
  OR
  (
    status = 'completed'

    AND turn_number > 0

    AND active_account_id IS NULL
    AND active_session_id IS NULL

    AND turn_started_at IS NULL
    AND turn_deadline_at IS NULL

    AND completed_at IS NOT NULL
  )
);


-- Existing initiative authority requires:
--
-- pending  -> initiative_reason NULL
-- active   -> canonical reason
--
-- Terminal combat preserves the original initiative
-- metadata instead of destroying historical authority.
ALTER TABLE
  public.cing_artillery_turn_states
DROP CONSTRAINT IF EXISTS
  cing_artillery_turn_states_initiative_reason_check;

ALTER TABLE
  public.cing_artillery_turn_states
ADD CONSTRAINT
  cing_artillery_turn_states_initiative_reason_check
CHECK (
  (
    status = 'pending'
    AND initiative_reason IS NULL
  )
  OR
  (
    status IN (
      'active',
      'completed'
    )
    AND initiative_reason IN (
      'speed',
      'speed_tiebreak'
    )
  )
);


-- =====================================================
-- QUERY SUPPORT
-- =====================================================

CREATE INDEX IF NOT EXISTS
  cing_artillery_matches_completed_at_idx
ON public.cing_artillery_matches (
  completed_at DESC,
  id
)
WHERE status = 'completed';


CREATE INDEX IF NOT EXISTS
  cing_artillery_combat_states_completed_at_idx
ON public.cing_artillery_combat_states (
  completed_at DESC,
  id
)
WHERE status = 'completed';


-- =====================================================
-- SECURITY / AUTHORITY BOUNDARY
--
-- No terminal mutation RPC is created by this foundation.
--
-- In particular:
--
--   service_role does NOT receive a new gameplay mutation
--   authority here.
--
-- The later fenced Resolution Commit SECURITY DEFINER RPC
-- will be the canonical HP-depletion terminal writer.
--
-- Direct application mutation privileges must remain
-- unchanged.
-- =====================================================

COMMIT;
