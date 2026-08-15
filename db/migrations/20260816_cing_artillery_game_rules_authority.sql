BEGIN;

-- =====================================================
-- CING ARTILLERY — GAME RULES AUTHORITY
--
-- Canonical mutable authority:
--   app_configs.cing_artillery_config.rules
--
-- Immutable per-match authority:
--   cing_artillery_combat_states.rules_version
--   cing_artillery_combat_states.rules_snapshot
--
-- A combat state snapshots the complete validated rules
-- object exactly once during atomic initialization.
--
-- Existing combat states are NEVER rewritten when the
-- global rules configuration changes.
--
-- No gameplay values are accepted from the caller.
-- PostgreSQL remains the durable final authority.
-- =====================================================

UPDATE public.app_configs
SET cing_artillery_config =
  jsonb_set(
    cing_artillery_config,
    '{rules}',
    '{
      "version": 1,
      "max_hp": 1000,
      "turn_duration_ms": 15000,
      "gravity": 980,
      "wind_min": -100,
      "wind_max": 100,
      "angle_min_deg": 10,
      "angle_max_deg": 80,
      "power_min": 0,
      "power_max": 100,
      "base_damage": 300,
      "blast_radius": 120
    }'::jsonb,
    true
  )
WHERE id = 1
  AND NOT (
    cing_artillery_config ? 'rules'
  );

ALTER TABLE
  public.cing_artillery_combat_states
ADD COLUMN IF NOT EXISTS
  rules_version integer;

ALTER TABLE
  public.cing_artillery_combat_states
ADD COLUMN IF NOT EXISTS
  rules_snapshot jsonb;

-- There must be no historical combat state without a
-- canonical immutable rules snapshot before constraints
-- are hardened.
DO $$
DECLARE
  v_existing_count bigint;
BEGIN
  SELECT count(*)
  INTO v_existing_count
  FROM public.cing_artillery_combat_states;

  IF v_existing_count <> 0 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_EXISTING_COMBAT_STATE_REQUIRES_RULES_MIGRATION';
  END IF;
END;
$$;

ALTER TABLE
  public.cing_artillery_combat_states
ALTER COLUMN rules_version
  SET NOT NULL;

ALTER TABLE
  public.cing_artillery_combat_states
ALTER COLUMN rules_snapshot
  SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'cing_artillery_combat_states_rules_version_check'
      AND conrelid =
        'public.cing_artillery_combat_states'::regclass
  ) THEN
    ALTER TABLE
      public.cing_artillery_combat_states
    ADD CONSTRAINT
      cing_artillery_combat_states_rules_version_check
    CHECK (
      rules_version > 0
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'cing_artillery_combat_states_rules_snapshot_object_check'
      AND conrelid =
        'public.cing_artillery_combat_states'::regclass
  ) THEN
    ALTER TABLE
      public.cing_artillery_combat_states
    ADD CONSTRAINT
      cing_artillery_combat_states_rules_snapshot_object_check
    CHECK (
      jsonb_typeof(
        rules_snapshot
      ) = 'object'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    p_match_runtime_id uuid
  )
RETURNS public.cing_artillery_combat_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_state
    public.cing_artillery_combat_states%ROWTYPE;

  v_config jsonb;
  v_rules jsonb;
  v_rules_version integer;
BEGIN
  IF p_match_runtime_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_ID_REQUIRED';
  END IF;

  SELECT
    cing_artillery_config
  INTO
    v_config
  FROM public.app_configs
  WHERE id = 1;

  IF NOT FOUND
     OR v_config IS NULL
     OR jsonb_typeof(
          v_config
        ) <> 'object'
     OR jsonb_typeof(
          v_config -> 'enabled'
        ) <> 'boolean'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_config_invalid';
  END IF;

  IF NOT (
    v_config ->> 'enabled'
  )::boolean THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;

  v_rules :=
    v_config -> 'rules';

  IF v_rules IS NULL
     OR jsonb_typeof(
          v_rules
        ) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_rules_config_invalid';
  END IF;

  IF jsonb_typeof(
       v_rules -> 'version'
     ) <> 'number'
     OR COALESCE(
          v_rules ->> 'version',
          ''
        ) !~ '^[1-9][0-9]*$'
     OR (
          CASE
            WHEN COALESCE(
                   v_rules ->> 'version',
                   ''
                 ) ~ '^[1-9][0-9]*$'
            THEN
              (
                v_rules ->> 'version'
              )::numeric > 2147483647
            ELSE
              false
          END
        )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_rules_config_invalid';
  END IF;

  v_rules_version :=
    (
      v_rules ->> 'version'
    )::integer;

  IF jsonb_typeof(v_rules -> 'max_hp') <> 'number'
     OR jsonb_typeof(v_rules -> 'turn_duration_ms') <> 'number'
     OR jsonb_typeof(v_rules -> 'gravity') <> 'number'
     OR jsonb_typeof(v_rules -> 'wind_min') <> 'number'
     OR jsonb_typeof(v_rules -> 'wind_max') <> 'number'
     OR jsonb_typeof(v_rules -> 'angle_min_deg') <> 'number'
     OR jsonb_typeof(v_rules -> 'angle_max_deg') <> 'number'
     OR jsonb_typeof(v_rules -> 'power_min') <> 'number'
     OR jsonb_typeof(v_rules -> 'power_max') <> 'number'
     OR jsonb_typeof(v_rules -> 'base_damage') <> 'number'
     OR jsonb_typeof(v_rules -> 'blast_radius') <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_rules_config_invalid';
  END IF;

  IF (v_rules ->> 'max_hp')::numeric <= 0
     OR (v_rules ->> 'turn_duration_ms')::numeric <= 0
     OR (v_rules ->> 'gravity')::numeric <= 0
     OR (v_rules ->> 'wind_min')::numeric >
        (v_rules ->> 'wind_max')::numeric
     OR (v_rules ->> 'angle_min_deg')::numeric >
        (v_rules ->> 'angle_max_deg')::numeric
     OR (v_rules ->> 'power_min')::numeric >
        (v_rules ->> 'power_max')::numeric
     OR (v_rules ->> 'base_damage')::numeric <= 0
     OR (v_rules ->> 'blast_radius')::numeric <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_rules_config_invalid';
  END IF;

  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.id = p_match_runtime_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_NOT_FOUND';
  END IF;

  IF v_runtime.status <> 'ready' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_NOT_COMBAT_ELIGIBLE';
  END IF;

  SELECT s.*
  INTO v_state
  FROM public.cing_artillery_combat_states AS s
  WHERE s.match_runtime_id =
    v_runtime.id;

  IF FOUND THEN
    IF v_state.match_id <>
         v_runtime.match_id
       OR v_state.player_one_account_id <>
         v_runtime.player_one_account_id
       OR v_state.player_one_session_id <>
         v_runtime.player_one_session_id
       OR v_state.player_two_account_id <>
         v_runtime.player_two_account_id
       OR v_state.player_two_session_id <>
         v_runtime.player_two_session_id
       OR v_state.rules_version IS NULL
       OR v_state.rules_snapshot IS NULL
       OR jsonb_typeof(
            v_state.rules_snapshot
          ) <> 'object'
       OR COALESCE(
            v_state.rules_snapshot ->> 'version',
            ''
          ) !~ '^[1-9][0-9]*$'
       OR (
            v_state.rules_snapshot ->> 'version'
          )::integer <>
          v_state.rules_version
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_STATE_INCONSISTENT';
    END IF;

    RETURN v_state;
  END IF;

  INSERT INTO public.cing_artillery_combat_states (
    id,
    match_runtime_id,
    match_id,
    player_one_account_id,
    player_one_session_id,
    player_two_account_id,
    player_two_session_id,
    status,
    rules_version,
    rules_snapshot
  )
  VALUES (
    gen_random_uuid(),
    v_runtime.id,
    v_runtime.match_id,
    v_runtime.player_one_account_id,
    v_runtime.player_one_session_id,
    v_runtime.player_two_account_id,
    v_runtime.player_two_session_id,
    'initialized',
    v_rules_version,
    v_rules
  )
  ON CONFLICT (
    match_runtime_id
  )
  DO NOTHING
  RETURNING *
  INTO v_state;

  IF v_state.id IS NULL THEN
    SELECT s.*
    INTO v_state
    FROM public.cing_artillery_combat_states AS s
    WHERE s.match_runtime_id =
      v_runtime.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_STATE_RESOLUTION_FAILED';
    END IF;
  END IF;

  IF v_state.match_id <>
       v_runtime.match_id
     OR v_state.player_one_account_id <>
       v_runtime.player_one_account_id
     OR v_state.player_one_session_id <>
       v_runtime.player_one_session_id
     OR v_state.player_two_account_id <>
       v_runtime.player_two_account_id
     OR v_state.player_two_session_id <>
       v_runtime.player_two_session_id
     OR v_state.rules_version IS NULL
     OR v_state.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_state.rules_snapshot
        ) <> 'object'
     OR COALESCE(
          v_state.rules_snapshot ->> 'version',
          ''
        ) !~ '^[1-9][0-9]*$'
     OR (
          v_state.rules_snapshot ->> 'version'
        )::integer <>
        v_state.rules_version
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_INCONSISTENT';
  END IF;

  RETURN v_state;
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    uuid
  )
FROM authenticated;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_get_or_create_combat_state_atomic(
    uuid
  )
TO service_role;

COMMIT;
