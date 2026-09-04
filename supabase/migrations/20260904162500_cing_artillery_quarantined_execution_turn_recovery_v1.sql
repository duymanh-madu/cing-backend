BEGIN;

-- =====================================================
-- CING ARTILLERY
-- QUARANTINED EXECUTION -> TURN RECOVERY V1
--
-- Durable lifecycle gap being closed:
--
--   accepted shot
--     -> execution retries exhausted / terminal failure
--     -> execution quarantined
--     -> ordinary no-shot timeout cannot progress because
--        an accepted shot exists for the exact turn
--     -> active turn becomes permanently stranded
--
-- Recovery semantics:
--
--   A quarantined execution forfeits only its exact current
--   turn. If that turn still owns canonical authority and no
--   durable resolution exists, advance to the opponent using
--   the existing private turn progression primitive.
--
-- PostgreSQL remains the sole lifecycle authority.
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.cing_artillery_recover_quarantined_turn_private_v1(
    p_execution_id uuid
  )
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_execution
    public.cing_artillery_shot_executions%ROWTYPE;

  v_command
    public.cing_artillery_shot_commands%ROWTYPE;

  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_advanced
    public.cing_artillery_turn_states%ROWTYPE;
BEGIN
  IF p_execution_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_QUARANTINE_RECOVERY_EXECUTION_ID_REQUIRED';
  END IF;


  -- ---------------------------------------------------
  -- Execution fence.
  --
  -- The quarantine mutation already owns this row when
  -- invoked from the trigger. Re-locking it in the same
  -- transaction is safe and also makes this primitive
  -- independently usable by migration repair.
  -- ---------------------------------------------------

  SELECT e.*
  INTO v_execution
  FROM public.cing_artillery_shot_executions AS e
  WHERE e.id =
    p_execution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;


  IF v_execution.status <>
       'quarantined'
  THEN
    RETURN false;
  END IF;


  -- ---------------------------------------------------
  -- Accepted-shot identity must exactly match execution.
  -- ---------------------------------------------------

  SELECT s.*
  INTO v_command
  FROM public.cing_artillery_shot_commands AS s
  WHERE s.id =
    v_execution.shot_command_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_QUARANTINE_RECOVERY_SHOT_COMMAND_MISSING';
  END IF;


  IF v_command.combat_state_id <>
       v_execution.combat_state_id
     OR v_command.turn_state_id <>
       v_execution.turn_state_id
     OR v_command.match_runtime_id <>
       v_execution.match_runtime_id
     OR v_command.match_id <>
       v_execution.match_id
     OR v_command.turn_number <>
       v_execution.turn_number
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_QUARANTINE_RECOVERY_EXECUTION_COMMAND_MISMATCH';
  END IF;


  -- ---------------------------------------------------
  -- A durable resolution always wins.
  --
  -- Never forfeit/advance a turn whose gameplay result
  -- was already committed.
  -- ---------------------------------------------------

  IF EXISTS (
    SELECT 1
    FROM public.cing_artillery_shot_resolutions AS r
    WHERE r.shot_command_id =
      v_execution.shot_command_id
      AND r.combat_state_id =
        v_execution.combat_state_id
      AND r.turn_state_id =
        v_execution.turn_state_id
      AND r.turn_number =
        v_execution.turn_number
  )
  THEN
    RETURN false;
  END IF;


  -- ---------------------------------------------------
  -- Canonical lifecycle locks.
  -- ---------------------------------------------------

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    v_execution.combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;


  IF v_combat.status <>
       'initialized'
     OR v_combat.match_runtime_id <>
       v_execution.match_runtime_id
     OR v_combat.match_id <>
       v_execution.match_id
  THEN
    RETURN false;
  END IF;


  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.id =
    v_execution.turn_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;


  -- ---------------------------------------------------
  -- Exact-current-turn fence.
  --
  -- This is what makes recovery idempotent:
  --
  -- first recovery N -> N+1 succeeds;
  -- any retry for execution N observes current turn N+1
  -- and becomes a no-op.
  -- ---------------------------------------------------

  IF v_turn.combat_state_id <>
       v_combat.id
     OR v_turn.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_turn.match_id <>
       v_combat.match_id
     OR v_turn.status <>
       'active'
     OR v_turn.turn_number <>
       v_execution.turn_number
     OR v_turn.active_account_id IS NULL
     OR v_turn.active_session_id IS NULL
     OR v_turn.turn_started_at IS NULL
     OR v_turn.turn_deadline_at IS NULL
  THEN
    RETURN false;
  END IF;


  -- ---------------------------------------------------
  -- The accepted shot must belong to the active player
  -- whose turn is being forfeited.
  -- ---------------------------------------------------

  IF v_command.shooter_account_id <>
       v_turn.active_account_id
     OR v_command.shooter_session_id <>
       v_turn.active_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_QUARANTINE_RECOVERY_ACTIVE_SHOOTER_MISMATCH';
  END IF;


  -- ---------------------------------------------------
  -- Reuse the one canonical turn transition primitive.
  -- ---------------------------------------------------

  v_advanced :=
    public.cing_artillery_advance_turn_private(
      v_combat.id,
      v_turn.id,
      v_turn.turn_number
    );


  IF v_advanced.id IS NULL
     OR v_advanced.id <>
          v_turn.id
     OR v_advanced.combat_state_id <>
          v_combat.id
     OR v_advanced.status <>
          'active'
     OR v_advanced.turn_number <>
          v_turn.turn_number + 1
     OR v_advanced.active_account_id IS NULL
     OR v_advanced.active_session_id IS NULL
     OR v_advanced.active_account_id =
          v_turn.active_account_id
     OR v_advanced.turn_started_at IS NULL
     OR v_advanced.turn_deadline_at IS NULL
     OR v_advanced.turn_deadline_at <=
          v_advanced.turn_started_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_QUARANTINE_RECOVERY_ADVANCEMENT_INCONSISTENT';
  END IF;


  RETURN true;
END;
$$;


-- Private authority only.
REVOKE ALL
ON FUNCTION
  public.cing_artillery_recover_quarantined_turn_private_v1(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_recover_quarantined_turn_private_v1(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_recover_quarantined_turn_private_v1(
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_recover_quarantined_turn_private_v1(
    uuid
  )
FROM service_role;


-- =====================================================
-- Trigger authority.
--
-- Covers every durable path that transitions an execution
-- into quarantine:
--
--   resolve_shot_execution_failure_atomic
--   release_expired_shot_executions_atomic
--   future canonical quarantine writers
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_quarantined_execution_turn_recovery_trigger_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM
    public.cing_artillery_recover_quarantined_turn_private_v1(
      NEW.id
    );

  RETURN NEW;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_quarantined_execution_turn_recovery_trigger_v1()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_quarantined_execution_turn_recovery_trigger_v1()
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_quarantined_execution_turn_recovery_trigger_v1()
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_quarantined_execution_turn_recovery_trigger_v1()
FROM service_role;


DROP TRIGGER IF EXISTS
  cing_artillery_quarantined_execution_turn_recovery_v1
ON public.cing_artillery_shot_executions;


CREATE TRIGGER
  cing_artillery_quarantined_execution_turn_recovery_v1
AFTER UPDATE OF status
ON public.cing_artillery_shot_executions
FOR EACH ROW
WHEN (
  NEW.status = 'quarantined'
  AND OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION
  public.cing_artillery_quarantined_execution_turn_recovery_trigger_v1();


-- =====================================================
-- GENERIC EXISTING-ZOMBIE REPAIR
--
-- No execution/match/user IDs are hardcoded.
--
-- Only quarantined executions still matching their exact
-- current ACTIVE turn can mutate anything. Historical/stale
-- rows safely return false.
-- =====================================================

DO $$
DECLARE
  v_candidate record;
BEGIN
  FOR v_candidate IN
    SELECT e.id
    FROM public.cing_artillery_shot_executions AS e
    INNER JOIN
      public.cing_artillery_turn_states AS t
        ON t.id =
          e.turn_state_id
       AND t.combat_state_id =
          e.combat_state_id
       AND t.turn_number =
          e.turn_number
    INNER JOIN
      public.cing_artillery_combat_states AS c
        ON c.id =
          e.combat_state_id
    WHERE e.status =
            'quarantined'
      AND t.status =
            'active'
      AND c.status =
            'initialized'
      AND NOT EXISTS (
        SELECT 1
        FROM public.cing_artillery_shot_resolutions AS r
        WHERE r.shot_command_id =
          e.shot_command_id
          AND r.combat_state_id =
            e.combat_state_id
          AND r.turn_state_id =
            e.turn_state_id
          AND r.turn_number =
            e.turn_number
      )
    ORDER BY
      e.created_at ASC,
      e.id ASC
  LOOP
    PERFORM
      public.cing_artillery_recover_quarantined_turn_private_v1(
        v_candidate.id
      );
  END LOOP;
END;
$$;


COMMIT;
