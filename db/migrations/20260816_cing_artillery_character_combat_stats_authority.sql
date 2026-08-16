BEGIN;

-- =====================================================
-- CING ARTILLERY — CHARACTER COMBAT STATS AUTHORITY V1
--
-- Canonical authorities:
--
-- Game rule:
--   rules.max_hp = base/effective HP authority for V1
--
-- Character:
--   attack
--   defense
--   speed
--
-- Immutable per-match result:
--   combat_states.player_one_stats_snapshot
--   combat_states.player_two_stats_snapshot
--
-- max_hp is deliberately resolved from the already
-- immutable rules snapshot.
--
-- Character/equipment HP progression must later enter
-- through an explicit modifier/resolver layer rather than
-- creating a competing max_hp authority.
--
-- Existing cosmetic inventory/loadout remains completely
-- outside gameplay-stat authority.
-- =====================================================

ALTER TABLE
  public.cing_artillery_characters
ADD COLUMN IF NOT EXISTS
  attack integer NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS
  defense integer NOT NULL DEFAULT 100,
ADD COLUMN IF NOT EXISTS
  speed integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'cing_artillery_characters_combat_stats_check'
      AND conrelid =
        'public.cing_artillery_characters'::regclass
  ) THEN
    ALTER TABLE
      public.cing_artillery_characters
    ADD CONSTRAINT
      cing_artillery_characters_combat_stats_check
    CHECK (
      attack > 0
      AND defense > 0
      AND speed > 0
    );
  END IF;
END;
$$;

ALTER TABLE
  public.cing_artillery_combat_states
ADD COLUMN IF NOT EXISTS
  player_one_stats_snapshot jsonb,
ADD COLUMN IF NOT EXISTS
  player_two_stats_snapshot jsonb;

-- Current production invariant:
-- no combat state may exist before immutable player-stat
-- snapshots become mandatory.
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
          'CING_ARTILLERY_EXISTING_COMBAT_STATE_REQUIRES_STATS_MIGRATION';
  END IF;
END;
$$;

ALTER TABLE
  public.cing_artillery_combat_states
ALTER COLUMN player_one_stats_snapshot
  SET NOT NULL,
ALTER COLUMN player_two_stats_snapshot
  SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'cing_artillery_combat_states_player_stats_snapshot_check'
      AND conrelid =
        'public.cing_artillery_combat_states'::regclass
  ) THEN
    ALTER TABLE
      public.cing_artillery_combat_states
    ADD CONSTRAINT
      cing_artillery_combat_states_player_stats_snapshot_check
    CHECK (
      jsonb_typeof(
        player_one_stats_snapshot
      ) = 'object'
      AND jsonb_typeof(
        player_two_stats_snapshot
      ) = 'object'

      AND jsonb_typeof(
        player_one_stats_snapshot -> 'max_hp'
      ) = 'number'
      AND jsonb_typeof(
        player_one_stats_snapshot -> 'attack'
      ) = 'number'
      AND jsonb_typeof(
        player_one_stats_snapshot -> 'defense'
      ) = 'number'
      AND jsonb_typeof(
        player_one_stats_snapshot -> 'speed'
      ) = 'number'

      AND jsonb_typeof(
        player_two_stats_snapshot -> 'max_hp'
      ) = 'number'
      AND jsonb_typeof(
        player_two_stats_snapshot -> 'attack'
      ) = 'number'
      AND jsonb_typeof(
        player_two_stats_snapshot -> 'defense'
      ) = 'number'
      AND jsonb_typeof(
        player_two_stats_snapshot -> 'speed'
      ) = 'number'

      -- max_hp mirrors immutable game-rule authority:
      -- positive numeric value, not character integer state.
      AND (
        player_one_stats_snapshot ->> 'max_hp'
      )::numeric > 0
      AND (
        player_two_stats_snapshot ->> 'max_hp'
      )::numeric > 0

      -- Character attributes preserve the exact positive
      -- PostgreSQL integer domain.
      AND (
        player_one_stats_snapshot ->> 'attack'
      ) ~ '^[1-9][0-9]*$'
      AND (
        player_one_stats_snapshot ->> 'defense'
      ) ~ '^[1-9][0-9]*$'
      AND (
        player_one_stats_snapshot ->> 'speed'
      ) ~ '^[1-9][0-9]*$'

      AND (
        player_two_stats_snapshot ->> 'attack'
      ) ~ '^[1-9][0-9]*$'
      AND (
        player_two_stats_snapshot ->> 'defense'
      ) ~ '^[1-9][0-9]*$'
      AND (
        player_two_stats_snapshot ->> 'speed'
      ) ~ '^[1-9][0-9]*$'

      AND (
        player_one_stats_snapshot ->> 'attack'
      )::numeric <= 2147483647
      AND (
        player_one_stats_snapshot ->> 'defense'
      )::numeric <= 2147483647
      AND (
        player_one_stats_snapshot ->> 'speed'
      )::numeric <= 2147483647

      AND (
        player_two_stats_snapshot ->> 'attack'
      )::numeric <= 2147483647
      AND (
        player_two_stats_snapshot ->> 'defense'
      )::numeric <= 2147483647
      AND (
        player_two_stats_snapshot ->> 'speed'
      )::numeric <= 2147483647
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

  v_player_one_character
    public.cing_artillery_characters%ROWTYPE;

  v_player_two_character
    public.cing_artillery_characters%ROWTYPE;

  v_config jsonb;
  v_rules jsonb;
  v_rules_version integer;

  v_max_hp numeric;

  v_player_one_stats jsonb;
  v_player_two_stats jsonb;
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
     OR jsonb_typeof(v_config) <> 'object'
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
     OR jsonb_typeof(v_rules) <> 'object'
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

  -- V1 player max HP derives from canonical game rules.
  -- Combat snapshot stores the resolved result.
  IF (
    v_rules ->> 'max_hp'
  ) !~ '^[1-9][0-9]*$'
     OR (
          v_rules ->> 'max_hp'
        )::numeric > 2147483647
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_rules_config_invalid';
  END IF;

  v_max_hp :=
    (
      v_rules ->> 'max_hp'
    )::numeric;

  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.id =
    p_match_runtime_id
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
       OR v_state.player_one_stats_snapshot IS NULL
       OR jsonb_typeof(
            v_state.player_one_stats_snapshot
          ) <> 'object'
       OR v_state.player_two_stats_snapshot IS NULL
       OR jsonb_typeof(
            v_state.player_two_stats_snapshot
          ) <> 'object'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_STATE_INCONSISTENT';
    END IF;

    RETURN v_state;
  END IF;

  /*
   * Freeze mutable character-stat authority at the exact
   * combat initialization boundary.
   *
   * Lock both character rows in deterministic account-id
   * order before reading either snapshot. This prevents
   * concurrent progression/stat updates from racing combat
   * initialization and avoids opposite lock acquisition
   * order between concurrent transactions.
   */
  PERFORM c.account_id
  FROM public.cing_artillery_characters AS c
  WHERE c.account_id IN (
    v_runtime.player_one_account_id,
    v_runtime.player_two_account_id
  )
  ORDER BY c.account_id
  FOR UPDATE;

  SELECT c.*
  INTO v_player_one_character
  FROM public.cing_artillery_characters AS c
  WHERE c.account_id =
    v_runtime.player_one_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_ONE_CHARACTER_NOT_FOUND';
  END IF;

  SELECT c.*
  INTO v_player_two_character
  FROM public.cing_artillery_characters AS c
  WHERE c.account_id =
    v_runtime.player_two_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_TWO_CHARACTER_NOT_FOUND';
  END IF;

  v_player_one_stats :=
    jsonb_build_object(
      'max_hp',
        v_max_hp,
      'attack',
        v_player_one_character.attack,
      'defense',
        v_player_one_character.defense,
      'speed',
        v_player_one_character.speed
    );

  v_player_two_stats :=
    jsonb_build_object(
      'max_hp',
        v_max_hp,
      'attack',
        v_player_two_character.attack,
      'defense',
        v_player_two_character.defense,
      'speed',
        v_player_two_character.speed
    );

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
    rules_snapshot,
    player_one_stats_snapshot,
    player_two_stats_snapshot
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
    v_rules,
    v_player_one_stats,
    v_player_two_stats
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
     OR v_state.player_one_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_state.player_one_stats_snapshot
        ) <> 'object'
     OR v_state.player_two_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_state.player_two_stats_snapshot
        ) <> 'object'
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
