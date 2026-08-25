BEGIN;

-- =====================================================
-- CING PIU PIU
-- ABANDONED TURN INITIATIVE COMPATIBILITY V1
--
-- Migration 72 introduced canonical abandoned terminal
-- state while intentionally preserving initiative_reason.
--
-- The existing initiative constraint predates abandoned
-- and currently permits canonical initiative provenance
-- only for:
--
--   active
--   completed
--
-- Extend that exact provenance contract to:
--
--   abandoned
--
-- No gameplay mutation authority is rewritten here.
-- No rollout config is changed.
-- =====================================================

ALTER TABLE
  public.cing_artillery_turn_states

DROP CONSTRAINT
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
      'completed',
      'abandoned'
    )

    AND initiative_reason IN (
      'speed',
      'speed_tiebreak'
    )
  )
);


COMMIT;
