BEGIN;

-- =====================================================
-- CING PIU PIU
-- HISTORICAL HP-DEPLETED GAMEPLAY-SESSION REPAIR V1
--
-- Scope:
--   exactly one pre-migration-74 production match
--
-- Root cause:
--   the historical hp_depleted terminal authority
--   completed match/runtime/combat/turn but did not
--   complete the two gameplay sessions.
--
-- This migration is intentionally NOT generic.
-- It is bounded to one fully attested historical match,
-- exact participants, exact gameplay sessions, exact
-- terminal timestamp, and exact matched-ticket provenance.
--
-- It does NOT mutate:
--   matchmaking tickets
--   match
--   runtime
--   combat
--   turn
--   HP
--   shots
--   rewards/economy
--   rollout configuration
-- =====================================================

DO $repair$
DECLARE
  v_match
    public.cing_artillery_matches%ROWTYPE;

  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_vital
    public.cing_artillery_combat_vital_states%ROWTYPE;

  v_session_one
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_session_two
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_ticket_count integer;
  v_updated_count integer;
BEGIN
  -- ===================================================
  -- CANONICAL TERMINAL LOCK ORDER
  --
  -- Keep this repair aligned with the live terminal and
  -- abandonment authorities:
  --
  --   combat -> turn -> vital -> runtime -> match
  --     -> gameplay sessions
  --
  -- This avoids introducing a historical-repair-specific
  -- reverse lock order.
  -- ===================================================

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.match_id =
    'cf31412a-540e-4b40-960c-aff080052998'::uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_COMBAT_NOT_FOUND';
  END IF;


  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.combat_state_id =
    v_combat.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_TURN_NOT_FOUND';
  END IF;


  SELECT v.*
  INTO v_vital
  FROM public.cing_artillery_combat_vital_states AS v
  WHERE v.combat_state_id =
    v_combat.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_VITAL_NOT_FOUND';
  END IF;


  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.id =
    v_combat.match_runtime_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_RUNTIME_NOT_FOUND';
  END IF;


  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id =
    v_combat.match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_MATCH_NOT_FOUND';
  END IF;


  IF v_match.id <>
       'cf31412a-540e-4b40-960c-aff080052998'::uuid
     OR v_match.status <>
       'completed'
     OR v_match.player_one_account_id <>
       'a8d6fb29-2a08-4e92-a201-ce2331404202'::uuid
     OR v_match.player_one_session_id <>
       'cced9874-3bb6-409e-823e-20eabe047650'::uuid
     OR v_match.player_two_account_id <>
       'c7d0593a-e873-46b9-bc61-08a78cc8ee08'::uuid
     OR v_match.player_two_session_id <>
       '81478f59-47c3-46a4-98f6-9505ef355e6d'::uuid
     OR v_match.winner_account_id <>
       'a8d6fb29-2a08-4e92-a201-ce2331404202'::uuid
     OR v_match.loser_account_id <>
       'c7d0593a-e873-46b9-bc61-08a78cc8ee08'::uuid
     OR v_match.completion_reason <>
       'hp_depleted'
     OR v_match.completed_at <>
       '2026-08-25T08:22:13.177018+00:00'::timestamptz
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_MATCH_FENCE_FAILED';
  END IF;


  IF v_runtime.match_id <>
       v_match.id
     OR v_runtime.status <>
       'completed'
     OR v_runtime.winner_account_id <>
       v_match.winner_account_id
     OR v_runtime.loser_account_id <>
       v_match.loser_account_id
     OR v_runtime.completion_reason <>
       'hp_depleted'
     OR v_runtime.completed_at <>
       v_match.completed_at
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_RUNTIME_FENCE_FAILED';
  END IF;


  IF v_combat.match_id <>
       v_match.id
     OR v_combat.match_runtime_id <>
       v_runtime.id
     OR v_combat.status <>
       'completed'
     OR v_combat.winner_account_id <>
       v_match.winner_account_id
     OR v_combat.loser_account_id <>
       v_match.loser_account_id
     OR v_combat.completion_reason <>
       'hp_depleted'
     OR v_combat.completed_at <>
       v_match.completed_at
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_COMBAT_FENCE_FAILED';
  END IF;


  IF v_turn.combat_state_id <>
       v_combat.id
     OR v_turn.match_runtime_id <>
       v_runtime.id
     OR v_turn.match_id <>
       v_match.id
     OR v_turn.status <>
       'completed'
     OR v_turn.completed_at <>
       v_match.completed_at
     OR v_turn.active_account_id
          IS NOT NULL
     OR v_turn.active_session_id
          IS NOT NULL
     OR v_turn.turn_started_at
          IS NOT NULL
     OR v_turn.turn_deadline_at
          IS NOT NULL
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_TURN_FENCE_FAILED';
  END IF;


  IF v_vital.combat_state_id <>
       v_combat.id
     OR v_vital.match_runtime_id <>
       v_runtime.id
     OR v_vital.match_id <>
       v_match.id
     OR v_vital.player_one_account_id <>
       v_match.player_one_account_id
     OR v_vital.player_two_account_id <>
       v_match.player_two_account_id
     OR v_vital.player_one_current_hp <>
       700
     OR v_vital.player_two_current_hp <>
       0
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_VITAL_FENCE_FAILED';
  END IF;


  PERFORM s.id
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id IN (
    v_match.player_one_session_id,
    v_match.player_two_session_id
  )
  ORDER BY s.id
  FOR UPDATE;


  SELECT s.*
  INTO v_session_one
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_one_session_id
    AND s.account_id =
      v_match.player_one_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_PLAYER_ONE_SESSION_NOT_FOUND';
  END IF;


  SELECT s.*
  INTO v_session_two
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_two_session_id
    AND s.account_id =
      v_match.player_two_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_PLAYER_TWO_SESSION_NOT_FOUND';
  END IF;


  SELECT count(*)
  INTO v_ticket_count
  FROM public.cing_artillery_matchmaking_tickets AS t
  WHERE t.match_id =
      v_match.id
    AND t.status =
      'matched'
    AND t.cancelled_at
      IS NULL
    AND t.matched_at
      IS NOT NULL
    AND (
      (
        t.account_id =
          v_match.player_one_account_id
        AND t.gameplay_session_id =
          v_match.player_one_session_id
      )
      OR
      (
        t.account_id =
          v_match.player_two_account_id
        AND t.gameplay_session_id =
          v_match.player_two_session_id
      )
    );

  IF v_ticket_count <> 2 THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_MATCHED_TICKET_FENCE_FAILED';
  END IF;


  IF v_session_one.status =
       'completed'
     AND v_session_two.status =
       'completed'
     AND v_session_one.ended_at =
       v_match.completed_at
     AND v_session_two.ended_at =
       v_match.completed_at
  THEN
    RETURN;
  END IF;


  IF v_session_one.status <>
       'active'
     OR v_session_one.ended_at
          IS NOT NULL
     OR v_session_two.status <>
       'active'
     OR v_session_two.ended_at
          IS NOT NULL
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_SESSION_STATE_FENCE_FAILED';
  END IF;


  UPDATE public.cing_artillery_gameplay_sessions AS s
  SET
    status =
      'completed',
    ended_at =
      v_match.completed_at,
    updated_at =
      v_match.completed_at
  WHERE s.id =
      v_session_one.id
    AND s.account_id =
      v_session_one.account_id
    AND s.status =
      'active'
    AND s.ended_at
      IS NULL;

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_PLAYER_ONE_UPDATE_CONFLICT';
  END IF;


  UPDATE public.cing_artillery_gameplay_sessions AS s
  SET
    status =
      'completed',
    ended_at =
      v_match.completed_at,
    updated_at =
      v_match.completed_at
  WHERE s.id =
      v_session_two.id
    AND s.account_id =
      v_session_two.account_id
    AND s.status =
      'active'
    AND s.ended_at
      IS NULL;

  GET DIAGNOSTICS
    v_updated_count =
      ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_PLAYER_TWO_UPDATE_CONFLICT';
  END IF;


  SELECT s.*
  INTO v_session_one
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
    v_match.player_one_session_id;

  SELECT s.*
  INTO v_session_two
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
    v_match.player_two_session_id;

  IF v_session_one.status <>
       'completed'
     OR v_session_two.status <>
       'completed'
     OR v_session_one.ended_at <>
       v_match.completed_at
     OR v_session_two.ended_at <>
       v_match.completed_at
     OR v_session_one.updated_at <>
       v_match.completed_at
     OR v_session_two.updated_at <>
       v_match.completed_at
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_REPAIR_POSTCONDITION_FAILED';
  END IF;
END;
$repair$;

COMMIT;
