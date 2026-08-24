BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- CORE GAMEPLAY PROGRESSION EFFECTIVE ACCESS V1
--
-- Purpose:
--
-- Replace legacy global-only progression denial with:
--
--   global gameplay enabled
--      OR
--   active private-beta membership
--
-- User boundary:
--   onboarding -> canonical user_id access
--
-- Pair boundaries:
--   both canonical participants must retain effective access
--
-- This migration intentionally excludes:
--
--   matchmaking
--   shot acceptance / execution enqueue
--   end-session cleanup
--   worker claim/retry/recovery
--   fenced resolution commit
--   turn advancement after accepted execution
--   terminal combat completion
--   result stream
--   character/cosmetic hardening
--
-- Existing gameplay semantics and canonical lock order are
-- copied from the final manifest-owned function bodies.
--
-- Canonical source provenance:
--   onboard_cing_artillery_character_atomic <- order 4: db/migrations/20260814_cing_artillery_onboarding_atomic.sql
--   cing_artillery_get_or_create_match_runtime_atomic <- order 9: db/migrations/20260814_cing_artillery_match_runtime_foundation.sql
--   cing_artillery_get_or_create_combat_state_atomic <- order 13: db/migrations/20260816_cing_artillery_character_combat_stats_authority.sql
--   cing_artillery_get_or_create_combat_vital_state_atomic <- order 22: db/migrations/20260817_cing_artillery_combat_vital_state_foundation.sql
--   cing_artillery_get_or_create_combat_world_atomic <- order 38: db/migrations/20260818_cing_artillery_canonical_wind_sampling_v1.sql
--   cing_artillery_get_or_create_turn_state_atomic <- order 12: db/migrations/20260816_cing_artillery_turn_state_foundation.sql
--   cing_artillery_activate_first_turn_atomic <- order 14: db/migrations/20260816_cing_artillery_initiative_authority.sql
-- =====================================================


CREATE OR REPLACE FUNCTION
  public.onboard_cing_artillery_character_atomic(
    p_user_id text,
    p_character_name text,
    p_gender text
  )
RETURNS TABLE (
  account_id uuid,
  account_status text,
  character_key text,
  character_name text,
  gender text,
  character_created boolean,
  starter_inventory_granted integer,
  starter_loadout_equipped integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text :=
    btrim(
      COALESCE(
        p_user_id,
        ''
      )
    );

  v_character_name text :=
    regexp_replace(
      btrim(
        COALESCE(
          p_character_name,
          ''
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    );

  v_gender text :=
    lower(
      btrim(
        COALESCE(
          p_gender,
          ''
        )
      )
    );

  v_config jsonb;
  v_starter jsonb;
  v_items jsonb;

  v_account
    public.cing_artillery_accounts%ROWTYPE;

  v_character
    public.cing_artillery_characters%ROWTYPE;

  v_item jsonb;
  v_item_key text;
  v_item_type text;
  v_existing_item_type text;
  v_equip boolean;

  v_inventory_item_id uuid;
  v_inserted_inventory_id uuid;

  v_seen_item_keys text[] :=
    ARRAY[]::text[];

  v_character_created boolean :=
    false;

  v_inventory_granted integer :=
    0;

  v_loadout_equipped integer :=
    0;
BEGIN
  -- ---------------------------------------------------
  -- Request contract
  -- ---------------------------------------------------

  IF v_user_id = '' THEN
    RAISE EXCEPTION
      'cing_artillery_invalid_user_id';
  END IF;

  IF char_length(
       v_character_name
     ) NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION
      'cing_artillery_invalid_character_name';
  END IF;

  IF v_gender NOT IN (
    'male',
    'female'
  ) THEN
    RAISE EXCEPTION
      'cing_artillery_invalid_gender';
  END IF;

  -- ---------------------------------------------------
  -- Runtime configuration
  -- ---------------------------------------------------

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
        ) <> 'object' THEN
    RAISE EXCEPTION
      'cing_artillery_config_invalid';
  END IF;

  IF jsonb_typeof(
       v_config -> 'enabled'
     ) <> 'boolean' THEN
    RAISE EXCEPTION
      'cing_artillery_config_invalid';
  END IF;

  IF jsonb_typeof(
       v_config -> 'version'
     ) <> 'number'
     OR COALESCE(
          v_config ->> 'version',
          ''
        ) !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION
      'cing_artillery_config_invalid';
  END IF;




  -- Effective gameplay admission:
  -- global enabled OR active private beta.
  IF NOT
    public.cing_artillery_has_effective_gameplay_access_v1(
      v_user_id
    )
  THEN
    RAISE EXCEPTION
      'cing_artillery_disabled';
  END IF;

  v_starter :=
    v_config -> 'starter';

  IF v_starter IS NULL
     OR jsonb_typeof(
          v_starter
        ) <> 'object' THEN
    RAISE EXCEPTION
      'cing_artillery_starter_config_invalid';
  END IF;

  IF jsonb_typeof(
       v_starter -> 'version'
     ) <> 'number'
     OR COALESCE(
          v_starter ->> 'version',
          ''
        ) !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION
      'cing_artillery_starter_config_invalid';
  END IF;

  v_items :=
    v_starter -> 'items';

  IF v_items IS NULL
     OR jsonb_typeof(
          v_items
        ) <> 'array' THEN
    RAISE EXCEPTION
      'cing_artillery_starter_config_invalid';
  END IF;

  -- ---------------------------------------------------
  -- Account
  --
  -- ON CONFLICT makes concurrent first-login safe.
  -- ---------------------------------------------------

  INSERT INTO public.cing_artillery_accounts (
    id,
    user_id,
    status
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    'active'
  )
  ON CONFLICT (
    user_id
  )
  DO NOTHING;

  SELECT
    *
  INTO
    v_account
  FROM public.cing_artillery_accounts
  WHERE user_id =
    v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'cing_artillery_account_creation_failed';
  END IF;

  IF v_account.status <> 'active' THEN
    RAISE EXCEPTION
      'cing_artillery_account_not_active';
  END IF;

  -- ---------------------------------------------------
  -- Character identity
  --
  -- First successful onboarding writes identity.
  -- Retry never becomes an implicit rename operation.
  -- ---------------------------------------------------

  INSERT INTO public.cing_artillery_characters (
    account_id,
    character_name,
    gender
  )
  VALUES (
    v_account.id,
    v_character_name,
    v_gender
  )
  ON CONFLICT (
    account_id
  )
  DO NOTHING;

  v_character_created :=
    FOUND;

  SELECT
    *
  INTO
    v_character
  FROM public.cing_artillery_characters
  WHERE account_id =
    v_account.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'cing_artillery_character_creation_failed';
  END IF;

  IF NOT v_character_created THEN

    IF v_character.character_name IS NULL
       AND v_character.gender IS NULL THEN

      UPDATE public.cing_artillery_characters
      SET
        character_name =
          v_character_name,

        gender =
          v_gender,

        updated_at =
          now()
      WHERE account_id =
        v_account.id
      RETURNING *
      INTO v_character;

    ELSIF (
      v_character.character_name IS NULL
      AND v_character.gender IS NOT NULL
    ) OR (
      v_character.character_name IS NOT NULL
      AND v_character.gender IS NULL
    ) THEN

      RAISE EXCEPTION
        'cing_artillery_character_partial_identity';

    END IF;

  END IF;

  -- ---------------------------------------------------
  -- Starter inventory / loadout
  --
  -- Config is validated before each write.
  -- Inventory uniqueness:
  --   account_id + item_key
  --
  -- Loadout:
  --   insert-only during onboarding
  --   retries never replace player's current equipment
  -- ---------------------------------------------------

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(
      v_items
    )
  LOOP

    IF jsonb_typeof(
         v_item
       ) <> 'object' THEN
      RAISE EXCEPTION
        'cing_artillery_starter_config_invalid';
    END IF;

    v_item_key :=
      btrim(
        COALESCE(
          v_item ->> 'item_key',
          ''
        )
      );

    v_item_type :=
      btrim(
        COALESCE(
          v_item ->> 'item_type',
          ''
        )
      );

    IF v_item_key = ''
       OR v_item_key <>
          COALESCE(
            v_item ->> 'item_key',
            ''
          ) THEN
      RAISE EXCEPTION
        'cing_artillery_starter_item_key_invalid';
    END IF;

    IF v_item_type NOT IN (
      'character_skin',
      'weapon_skin',
      'projectile_effect',
      'explosion_effect',
      'victory_effect',
      'emote',
      'pet',
      'aura',
      'title_frame',
      'home_decor'
    ) THEN
      RAISE EXCEPTION
        'cing_artillery_starter_item_type_invalid';
    END IF;

    IF v_item ? 'equip'
       AND jsonb_typeof(
             v_item -> 'equip'
           ) <> 'boolean' THEN
      RAISE EXCEPTION
        'cing_artillery_starter_equip_invalid';
    END IF;

    v_equip :=
      COALESCE(
        (
          v_item ->> 'equip'
        )::boolean,
        false
      );

    IF v_equip
       AND v_item_type =
         'home_decor' THEN
      RAISE EXCEPTION
        'cing_artillery_home_decor_not_equippable';
    END IF;

    IF v_item_key = ANY(
      v_seen_item_keys
    ) THEN
      RAISE EXCEPTION
        'cing_artillery_duplicate_starter_item_key';
    END IF;

    v_seen_item_keys :=
      array_append(
        v_seen_item_keys,
        v_item_key
      );

    v_inserted_inventory_id :=
      NULL;

    INSERT INTO public.cing_artillery_inventory (
      id,
      account_id,
      item_key,
      item_type
    )
    VALUES (
      gen_random_uuid(),
      v_account.id,
      v_item_key,
      v_item_type
    )
    ON CONFLICT (
      account_id,
      item_key
    )
    DO NOTHING
    RETURNING id
    INTO
      v_inserted_inventory_id;

    IF v_inserted_inventory_id IS NOT NULL THEN

      v_inventory_item_id :=
        v_inserted_inventory_id;

      v_inventory_granted :=
        v_inventory_granted + 1;

    ELSE

      SELECT
        id,
        item_type
      INTO
        v_inventory_item_id,
        v_existing_item_type
      FROM public.cing_artillery_inventory
      WHERE account_id =
        v_account.id
        AND item_key =
          v_item_key;

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'cing_artillery_starter_inventory_resolution_failed';
      END IF;

      IF v_existing_item_type <>
         v_item_type THEN
        RAISE EXCEPTION
          'cing_artillery_starter_item_type_conflict';
      END IF;

    END IF;

    IF v_equip THEN

      INSERT INTO public.cing_artillery_loadouts (
        account_id,
        item_type,
        inventory_item_id
      )
      VALUES (
        v_account.id,
        v_item_type,
        v_inventory_item_id
      )
      ON CONFLICT (
        account_id,
        item_type
      )
      DO NOTHING;

      IF FOUND THEN
        v_loadout_equipped :=
          v_loadout_equipped + 1;
      END IF;

    END IF;

  END LOOP;

  -- Re-read canonical character state.
  SELECT
    *
  INTO
    v_character
  FROM public.cing_artillery_characters
  WHERE account_id =
    v_account.id;

  RETURN QUERY
  SELECT
    v_account.id,
    v_account.status,
    v_character.character_key,
    v_character.character_name,
    v_character.gender,
    v_character_created,
    v_inventory_granted,
    v_loadout_equipped;
END;
$$;


CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_match_runtime_atomic(
    p_match_id uuid
  )
RETURNS public.cing_artillery_match_runtimes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match
    public.cing_artillery_matches%ROWTYPE;

  v_player_one_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_player_two_session
    public.cing_artillery_gameplay_sessions%ROWTYPE;

  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_config jsonb;
BEGIN
  IF p_match_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE = 'CING_ARTILLERY_MATCH_ID_REQUIRED';
  END IF;

  -- Defense in depth:
  -- repository/RPC cannot bypass the dark feature gate.
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
        MESSAGE = 'cing_artillery_config_invalid';
  END IF;



  SELECT m.*
  INTO v_match
  FROM public.cing_artillery_matches AS m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE = 'CING_ARTILLERY_MATCH_NOT_FOUND';
  END IF;


  -- Effective gameplay progression:
  -- both canonical participants must retain access.
  IF NOT
    public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
      v_match.player_one_account_id,
      v_match.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;

IF v_match.status <> 'matched' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = 'CING_ARTILLERY_MATCH_NOT_RUNTIME_ELIGIBLE';
  END IF;

  -- Idempotent canonical re-entry.
  SELECT r.*
  INTO v_runtime
  FROM public.cing_artillery_match_runtimes AS r
  WHERE r.match_id = v_match.id;

  IF FOUND THEN
    RETURN v_runtime;
  END IF;

  -- Lock gameplay sessions in deterministic UUID order
  -- to avoid opposite lock acquisition order.
  PERFORM s.id
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id IN (
    v_match.player_one_session_id,
    v_match.player_two_session_id
  )
  ORDER BY s.id
  FOR UPDATE;

  SELECT s.*
  INTO v_player_one_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_one_session_id
    AND s.account_id =
      v_match.player_one_account_id;

  IF NOT FOUND
     OR v_player_one_session.status <> 'active'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_PLAYER_ONE_SESSION_NOT_ACTIVE';
  END IF;

  SELECT s.*
  INTO v_player_two_session
  FROM public.cing_artillery_gameplay_sessions AS s
  WHERE s.id =
      v_match.player_two_session_id
    AND s.account_id =
      v_match.player_two_account_id;

  IF NOT FOUND
     OR v_player_two_session.status <> 'active'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_PLAYER_TWO_SESSION_NOT_ACTIVE';
  END IF;

  INSERT INTO public.cing_artillery_match_runtimes (
    id,
    match_id,
    player_one_account_id,
    player_one_session_id,
    player_two_account_id,
    player_two_session_id,
    status
  )
  VALUES (
    gen_random_uuid(),
    v_match.id,
    v_match.player_one_account_id,
    v_match.player_one_session_id,
    v_match.player_two_account_id,
    v_match.player_two_session_id,
    'ready'
  )
  ON CONFLICT (
    match_id
  )
  DO NOTHING
  RETURNING *
  INTO v_runtime;

  IF v_runtime.id IS NULL THEN
    SELECT r.*
    INTO v_runtime
    FROM public.cing_artillery_match_runtimes AS r
    WHERE r.match_id =
      v_match.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_MATCH_RUNTIME_RESOLUTION_FAILED';
    END IF;
  END IF;

  -- Defensive authority check:
  -- existing canonical runtime must still exactly represent
  -- the immutable matchmaking result.
  IF v_runtime.player_one_account_id <>
       v_match.player_one_account_id
     OR v_runtime.player_one_session_id <>
       v_match.player_one_session_id
     OR v_runtime.player_two_account_id <>
       v_match.player_two_account_id
     OR v_runtime.player_two_session_id <>
       v_match.player_two_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_MATCH_RUNTIME_STATE_INCONSISTENT';
  END IF;

  RETURN v_runtime;
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


  -- Effective gameplay progression:
  -- both canonical participants must retain access.
  IF NOT
    public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
      v_runtime.player_one_account_id,
      v_runtime.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
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


CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_combat_vital_state_atomic(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_combat_vital_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_vital
    public.cing_artillery_combat_vital_states%ROWTYPE;

  v_player_one_max_hp numeric;
  v_player_two_max_hp numeric;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;

  /*
   * Existing combat state is canonical immutable
   * initialization authority.
   *
   * Fail closed if its required stat snapshots do not
   * expose valid max_hp values.
   */

  -- Effective gameplay progression:
  -- both canonical participants must retain access.
  IF NOT
    public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
      v_combat.player_one_account_id,
      v_combat.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;

IF v_combat.player_one_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.player_one_stats_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.player_one_stats_snapshot -> 'max_hp'
        ) <> 'number'
     OR v_combat.player_two_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.player_two_stats_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.player_two_stats_snapshot -> 'max_hp'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATS_SNAPSHOT_INVALID';
  END IF;

  BEGIN
    v_player_one_max_hp :=
      (
        v_combat.player_one_stats_snapshot ->> 'max_hp'
      )::numeric;

    v_player_two_max_hp :=
      (
        v_combat.player_two_stats_snapshot ->> 'max_hp'
      )::numeric;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_STATS_SNAPSHOT_INVALID';
  END;

  IF v_player_one_max_hp IS NULL
     OR v_player_one_max_hp = 'NaN'::numeric
     OR v_player_one_max_hp = 'Infinity'::numeric
     OR v_player_one_max_hp = '-Infinity'::numeric
     OR v_player_one_max_hp <= 0
     OR v_player_two_max_hp IS NULL
     OR v_player_two_max_hp = 'NaN'::numeric
     OR v_player_two_max_hp = 'Infinity'::numeric
     OR v_player_two_max_hp = '-Infinity'::numeric
     OR v_player_two_max_hp <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATS_SNAPSHOT_INVALID';
  END IF;

  /*
   * Idempotent re-entry.
   *
   * Existing mutable HP must NOT be compared with max_hp:
   * after damage is introduced current_hp is expected to
   * diverge from its immutable initial value.
   *
   * Identity, however, may never drift.
   */
  SELECT v.*
  INTO v_vital
  FROM public.cing_artillery_combat_vital_states AS v
  WHERE v.combat_state_id =
    v_combat.id;

  IF FOUND THEN
    IF v_vital.match_runtime_id <>
         v_combat.match_runtime_id
       OR v_vital.match_id <>
         v_combat.match_id
       OR v_vital.player_one_account_id <>
         v_combat.player_one_account_id
       OR v_vital.player_two_account_id <>
         v_combat.player_two_account_id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_VITAL_STATE_INCONSISTENT';
    END IF;

    RETURN v_vital;
  END IF;

  INSERT INTO
    public.cing_artillery_combat_vital_states (
      id,
      combat_state_id,
      match_runtime_id,
      match_id,
      player_one_account_id,
      player_two_account_id,
      player_one_current_hp,
      player_two_current_hp
    )
  VALUES (
    gen_random_uuid(),
    v_combat.id,
    v_combat.match_runtime_id,
    v_combat.match_id,
    v_combat.player_one_account_id,
    v_combat.player_two_account_id,
    v_player_one_max_hp,
    v_player_two_max_hp
  )
  ON CONFLICT (
    combat_state_id
  )
  DO NOTHING
  RETURNING *
  INTO v_vital;

  IF v_vital.id IS NULL THEN
    SELECT v.*
    INTO v_vital
    FROM public.cing_artillery_combat_vital_states AS v
    WHERE v.combat_state_id =
      v_combat.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_VITAL_STATE_RESOLUTION_FAILED';
    END IF;
  END IF;

  IF v_vital.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_vital.match_id <>
       v_combat.match_id
     OR v_vital.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_vital.player_two_account_id <>
       v_combat.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_VITAL_STATE_INCONSISTENT';
  END IF;

  RETURN v_vital;
END;
$$;


CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_combat_world_atomic(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_combat_world_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config jsonb;

  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_world
    public.cing_artillery_combat_world_states%ROWTYPE;

  v_map
    public.cing_artillery_maps%ROWTYPE;

  v_spawn
    public.cing_artillery_map_spawn_pairs%ROWTYPE;

  v_selected_map_id uuid;
  v_selected_spawn_id uuid;

  v_wind_min numeric;
  v_wind_max numeric;
  v_initial_wind numeric;

  v_rules_version integer;
  v_physics_version integer;
  v_physics_fixed_scale integer;

  v_wind_min_scaled bigint;
  v_wind_max_scaled bigint;
  v_initial_wind_scaled bigint;

  v_lattice_count numeric;
  v_wind_ticket numeric;

  v_player_one_side text;
  v_player_two_side text;

  v_player_one_x integer;
  v_player_one_y integer;
  v_player_two_x integer;
  v_player_two_y integer;

  v_initialized_at timestamptz;

  /*
   * Canonical server-side entropy.
   *
   * Initiative authority already uses gen_random_uuid()
   * for cryptographically strong PostgreSQL randomness.
   *
   * Combat-world initialization follows the same policy.
   *
   * v_random_u32 is reconstructed from four independent
   * UUID bytes and therefore lies in:
   *
   *   0 .. 4294967295
   *
   * v_random_fraction therefore lies in:
   *
   *   [0, 1)
   */
  v_entropy uuid;
  v_random_u32 bigint;
  v_random_fraction numeric;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;


  -- ===================================================
  -- GAMEPLAY FEATURE GATE
  --
  -- This is a new gameplay-world initialization boundary,
  -- therefore it cannot create new world state while the
  -- game is dark.
  -- ===================================================

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




  -- ===================================================
  -- CANONICAL COMBAT LOCK
  -- ===================================================

  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;


  -- Effective gameplay progression:
  -- both canonical participants must retain access.
  IF NOT
    public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
      v_combat.player_one_account_id,
      v_combat.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;

IF v_combat.status <>
       'initialized'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_WORLD_ELIGIBLE';
  END IF;


  -- ===================================================
  -- IMMUTABLE WIND RULE AUTHORITY
  --
  -- Never read current global wind rules here.
  -- Existing combat rules_snapshot is the per-match source
  -- of truth.
  -- ===================================================

  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'wind_min'
        ) <> 'number'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'wind_max'
        ) <> 'number'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_RULES_INVALID';
  END IF;

  v_wind_min :=
    (
      v_combat.rules_snapshot ->>
        'wind_min'
    )::numeric;

  v_wind_max :=
    (
      v_combat.rules_snapshot ->>
        'wind_max'
    )::numeric;

  IF v_wind_min =
       'NaN'::numeric
     OR v_wind_max =
       'NaN'::numeric
     OR v_wind_min >
       v_wind_max
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_RULES_INVALID';
  END IF;


  -- ===================================================
  -- RULES VERSION / SCALED WIND AUTHORITY
  --
  -- Rules V1 keeps the historical continuous numeric wind.
  --
  -- Rules V2 / Physics V1 uses durable scaled integer wind
  -- as the canonical authority. initial_wind remains only a
  -- deterministic compatibility projection.
  -- ===================================================

  BEGIN
    v_rules_version :=
      (
        v_combat.rules_snapshot ->>
          'version'
      )::integer;
  EXCEPTION
    WHEN OTHERS THEN
      v_rules_version :=
        NULL;
  END;

  IF v_rules_version = 2 THEN
    BEGIN
      v_physics_version :=
        (
          v_combat.rules_snapshot ->>
            'physics_version'
        )::integer;

      v_physics_fixed_scale :=
        (
          v_combat.rules_snapshot ->>
            'physics_fixed_scale'
        )::integer;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE =
              'CING_ARTILLERY_COMBAT_WORLD_RULES_V2_INVALID';
    END;

    IF v_physics_version <> 1
       OR public.cing_artillery_validate_physics_rules_v2(
            v_combat.rules_snapshot
          )
          IS NOT TRUE
       OR public.cing_artillery_validate_acceleration_numeric_v1(
            v_combat.rules_snapshot,
            NULL
          )
          IS NOT TRUE
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_RULES_V2_INVALID';
    END IF;

    v_wind_min_scaled :=
      (
        v_wind_min *
        v_physics_fixed_scale
      )::bigint;

    v_wind_max_scaled :=
      (
        v_wind_max *
        v_physics_fixed_scale
      )::bigint;

    IF v_wind_min_scaled >
         v_wind_max_scaled
       OR v_wind_min_scaled <
          -9007199254740991::bigint
       OR v_wind_max_scaled >
          9007199254740991::bigint
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_WIND_SCALED_RULES_INVALID';
    END IF;

  ELSIF v_rules_version = 1 THEN
    v_physics_version :=
      NULL;

    v_physics_fixed_scale :=
      NULL;

    v_wind_min_scaled :=
      NULL;

    v_wind_max_scaled :=
      NULL;

  ELSE
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_RULES_VERSION_UNSUPPORTED';
  END IF;


  -- ===================================================
  -- IDEMPOTENT CANONICAL RE-ENTRY
  --
  -- enabled state is intentionally NOT checked here.
  --
  -- A map may be disabled after this world was initialized.
  -- Existing world snapshots must remain valid.
  -- ===================================================

  SELECT w.*
  INTO v_world
  FROM public.cing_artillery_combat_world_states AS w
  WHERE w.combat_state_id =
    v_combat.id;

  IF FOUND THEN
    IF v_world.match_runtime_id <>
         v_combat.match_runtime_id
       OR v_world.match_id <>
         v_combat.match_id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_INCONSISTENT';
    END IF;


    SELECT m.*
    INTO v_map
    FROM public.cing_artillery_maps AS m
    WHERE m.id =
      v_world.map_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_MAP_MISSING';
    END IF;


    SELECT s.*
    INTO v_spawn
    FROM public.cing_artillery_map_spawn_pairs AS s
    WHERE s.id =
      v_world.spawn_pair_id;

    IF NOT FOUND
       OR v_spawn.map_id <>
          v_map.id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_SPAWN_INCONSISTENT';
    END IF;


    -- Map content identity remains canonical even after the
    -- map is no longer selectable for new worlds.
    IF v_map.collision_format <>
         'bitmask_v1'
       OR NOT
         public.cing_artillery_validate_collision_bitmask_v1(
           v_map.width_px,
           v_map.height_px,
           v_map.collision_mask
         )
       OR v_map.collision_mask_sha256 !~
         '^[0-9a-f]{64}$'
       OR v_map.collision_mask_sha256 <>
         encode(
           extensions.digest(
             v_map.collision_mask,
             'sha256'
           ),
           'hex'
         )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_MAP_INCONSISTENT';
    END IF;


    IF NOT
      public.cing_artillery_validate_map_spawn_surface_v1(
        v_map.width_px,
        v_map.height_px,
        v_map.collision_mask,
        v_spawn.side_a_x,
        v_spawn.side_a_y
      )
      OR NOT
      public.cing_artillery_validate_map_spawn_surface_v1(
        v_map.width_px,
        v_map.height_px,
        v_map.collision_mask,
        v_spawn.side_b_x,
        v_spawn.side_b_y
      )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_SPAWN_INCONSISTENT';
    END IF;


    IF (
         v_world.player_one_side = 'a'
         AND (
           v_world.player_two_side <> 'b'
           OR v_world.player_one_x <>
              v_spawn.side_a_x
           OR v_world.player_one_y <>
              v_spawn.side_a_y
           OR v_world.player_two_x <>
              v_spawn.side_b_x
           OR v_world.player_two_y <>
              v_spawn.side_b_y
         )
       )
       OR
       (
         v_world.player_one_side = 'b'
         AND (
           v_world.player_two_side <> 'a'
           OR v_world.player_one_x <>
              v_spawn.side_b_x
           OR v_world.player_one_y <>
              v_spawn.side_b_y
           OR v_world.player_two_x <>
              v_spawn.side_a_x
           OR v_world.player_two_y <>
              v_spawn.side_a_y
         )
       )
       OR v_world.initial_wind =
          'NaN'::numeric
       OR v_world.initial_wind <
          v_wind_min
       OR v_world.initial_wind >
          v_wind_max
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_INCONSISTENT';
    END IF;

    IF v_rules_version = 2 THEN
      IF v_world.initial_wind_scaled IS NULL
         OR v_world.initial_wind_scaled <
            v_wind_min_scaled
         OR v_world.initial_wind_scaled >
            v_wind_max_scaled
         OR v_world.initial_wind_scaled <
            -9007199254740991::bigint
         OR v_world.initial_wind_scaled >
            9007199254740991::bigint
         OR v_world.initial_wind IS DISTINCT FROM
            (
              v_world.initial_wind_scaled::numeric
              /
              v_physics_fixed_scale::numeric
            )
      THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE =
              'CING_ARTILLERY_COMBAT_WORLD_WIND_NOT_CANONICAL';
      END IF;
    ELSE
      IF v_world.initial_wind_scaled IS NOT NULL THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE =
              'CING_ARTILLERY_COMBAT_WORLD_V1_SCALED_WIND_INVALID';
      END IF;
    END IF;

    RETURN v_world;
  END IF;


  -- ===================================================
  -- WEIGHTED MAP SELECTION
  --
  -- selection_weight is immutable map-catalog authority.
  --
  -- The candidate query observes one PostgreSQL statement
  -- snapshot. The chosen row is then locked and enabled is
  -- rechecked after lock acquisition.
  --
  -- A concurrent disable can therefore never commit a NEW
  -- world using a disabled map.
  -- ===================================================

  LOOP
    v_selected_map_id :=
      NULL;

    v_entropy :=
      gen_random_uuid();

    v_random_u32 :=
        get_byte(
          uuid_send(v_entropy),
          0
        )::bigint
        * 16777216
      +
        get_byte(
          uuid_send(v_entropy),
          1
        )::bigint
        * 65536
      +
        get_byte(
          uuid_send(v_entropy),
          2
        )::bigint
        * 256
      +
        get_byte(
          uuid_send(v_entropy),
          3
        )::bigint;

    v_random_fraction :=
      v_random_u32::numeric
      /
      4294967296::numeric;

    WITH eligible AS MATERIALIZED (
      SELECT
        m.id,

        sum(
          m.selection_weight::bigint
        ) OVER (
          ORDER BY m.id
          ROWS BETWEEN
            UNBOUNDED PRECEDING
            AND CURRENT ROW
        ) AS cumulative_weight,

        sum(
          m.selection_weight::bigint
        ) OVER () AS total_weight

      FROM public.cing_artillery_maps AS m

      WHERE m.enabled = true
    ),

    ticket AS MATERIALIZED (
      SELECT
        floor(
          v_random_fraction
          *
          max(
            e.total_weight
          )::numeric
        )::bigint
        + 1 AS value

      FROM eligible AS e
    )

    SELECT e.id
    INTO v_selected_map_id
    FROM eligible AS e
    CROSS JOIN ticket AS t
    WHERE e.cumulative_weight >=
      t.value
    ORDER BY
      e.cumulative_weight,
      e.id
    LIMIT 1;


    IF v_selected_map_id IS NULL THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_NO_ENABLED_MAP';
    END IF;


    SELECT m.*
    INTO v_map
    FROM public.cing_artillery_maps AS m
    WHERE m.id =
      v_selected_map_id
      AND m.enabled = true
    FOR UPDATE;

    IF FOUND THEN
      EXIT;
    END IF;

    -- The selected candidate was concurrently disabled.
    -- Re-select from the latest committed eligible set.
  END LOOP;


  -- Revalidate map eligibility after canonical row lock.
  IF v_map.collision_format <>
       'bitmask_v1'
     OR NOT
       public.cing_artillery_validate_collision_bitmask_v1(
         v_map.width_px,
         v_map.height_px,
         v_map.collision_mask
       )
     OR v_map.collision_mask_sha256 !~
       '^[0-9a-f]{64}$'
     OR v_map.collision_mask_sha256 <>
       encode(
         extensions.digest(
           v_map.collision_mask,
           'sha256'
         ),
         'hex'
       )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_MAP_INVALID';
  END IF;


  -- ===================================================
  -- WEIGHTED SPAWN SELECTION
  --
  -- Map row remains locked while the spawn is selected.
  --
  -- This preserves canonical map -> spawn lock ordering and
  -- is compatible with later spawn lifecycle authority.
  -- ===================================================

  LOOP
    v_selected_spawn_id :=
      NULL;

    v_entropy :=
      gen_random_uuid();

    v_random_u32 :=
        get_byte(
          uuid_send(v_entropy),
          0
        )::bigint
        * 16777216
      +
        get_byte(
          uuid_send(v_entropy),
          1
        )::bigint
        * 65536
      +
        get_byte(
          uuid_send(v_entropy),
          2
        )::bigint
        * 256
      +
        get_byte(
          uuid_send(v_entropy),
          3
        )::bigint;

    v_random_fraction :=
      v_random_u32::numeric
      /
      4294967296::numeric;

    WITH eligible AS MATERIALIZED (
      SELECT
        s.id,

        sum(
          s.selection_weight::bigint
        ) OVER (
          ORDER BY s.id
          ROWS BETWEEN
            UNBOUNDED PRECEDING
            AND CURRENT ROW
        ) AS cumulative_weight,

        sum(
          s.selection_weight::bigint
        ) OVER () AS total_weight

      FROM public.cing_artillery_map_spawn_pairs AS s

      WHERE s.map_id =
        v_map.id
        AND s.enabled = true
    ),

    ticket AS MATERIALIZED (
      SELECT
        floor(
          v_random_fraction
          *
          max(
            e.total_weight
          )::numeric
        )::bigint
        + 1 AS value

      FROM eligible AS e
    )

    SELECT e.id
    INTO v_selected_spawn_id
    FROM eligible AS e
    CROSS JOIN ticket AS t
    WHERE e.cumulative_weight >=
      t.value
    ORDER BY
      e.cumulative_weight,
      e.id
    LIMIT 1;


    IF v_selected_spawn_id IS NULL THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_NO_ENABLED_SPAWN';
    END IF;


    SELECT s.*
    INTO v_spawn
    FROM public.cing_artillery_map_spawn_pairs AS s
    WHERE s.id =
      v_selected_spawn_id
      AND s.map_id =
        v_map.id
      AND s.enabled = true
    FOR UPDATE;

    IF FOUND THEN
      EXIT;
    END IF;

    -- Defensive retry for future concurrent spawn lifecycle.
  END LOOP;


  IF NOT
    public.cing_artillery_validate_map_spawn_surface_v1(
      v_map.width_px,
      v_map.height_px,
      v_map.collision_mask,
      v_spawn.side_a_x,
      v_spawn.side_a_y
    )
    OR NOT
    public.cing_artillery_validate_map_spawn_surface_v1(
      v_map.width_px,
      v_map.height_px,
      v_map.collision_mask,
      v_spawn.side_b_x,
      v_spawn.side_b_y
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_SPAWN_INVALID';
  END IF;


  -- ===================================================
  -- SERVER-SIDE A/B ASSIGNMENT
  --
  -- Matchmaking order does not grant tactical side
  -- ownership.
  --
  -- The random decision is made only after the combat,
  -- map and spawn authorities are locked and is persisted
  -- exactly once.
  -- ===================================================

  v_entropy :=
    gen_random_uuid();

  IF (
    get_byte(
      uuid_send(v_entropy),
      0
    ) % 2
  ) = 0 THEN
    v_player_one_side :=
      'a';

    v_player_two_side :=
      'b';

    v_player_one_x :=
      v_spawn.side_a_x;

    v_player_one_y :=
      v_spawn.side_a_y;

    v_player_two_x :=
      v_spawn.side_b_x;

    v_player_two_y :=
      v_spawn.side_b_y;
  ELSE
    v_player_one_side :=
      'b';

    v_player_two_side :=
      'a';

    v_player_one_x :=
      v_spawn.side_b_x;

    v_player_one_y :=
      v_spawn.side_b_y;

    v_player_two_x :=
      v_spawn.side_a_x;

    v_player_two_y :=
      v_spawn.side_a_y;
  END IF;


  -- ===================================================
  -- INITIAL WIND
  --
  -- Rules V1:
  --
  --   preserve historical continuous numeric sampling.
  --
  -- Rules V2 / Physics V1:
  --
  --   uniformly sample every scaled integer lattice point
  --   using unbiased U64 rejection sampling.
  --
  --   initial_wind_scaled is authoritative.
  --
  --   initial_wind is a deterministic PostgreSQL NUMERIC
  --   compatibility projection only.
  -- ===================================================

  IF v_rules_version = 2 THEN
    v_lattice_count :=
      v_wind_max_scaled::numeric
      -
      v_wind_min_scaled::numeric
      +
      1;

    IF v_lattice_count <= 0
       OR trunc(v_lattice_count) <>
          v_lattice_count
       OR v_lattice_count >
          18446744073709551616::numeric
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_WIND_LATTICE_INVALID';
    END IF;

    v_wind_ticket :=
      public.cing_artillery_sample_uniform_u64_bounded_v1(
        v_lattice_count
      );

    v_initial_wind_scaled :=
      (
        v_wind_min_scaled::numeric
        +
        v_wind_ticket
      )::bigint;

    IF v_initial_wind_scaled <
         v_wind_min_scaled
       OR v_initial_wind_scaled >
          v_wind_max_scaled
       OR v_initial_wind_scaled <
          -9007199254740991::bigint
       OR v_initial_wind_scaled >
          9007199254740991::bigint
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_COMBAT_WORLD_SAMPLED_WIND_INVALID';
    END IF;

    v_initial_wind :=
      v_initial_wind_scaled::numeric
      /
      v_physics_fixed_scale::numeric;

  ELSE
    v_initial_wind_scaled :=
      NULL;

    IF v_wind_min =
         v_wind_max
    THEN
      v_initial_wind :=
        v_wind_min;
    ELSE
      v_entropy :=
        gen_random_uuid();

      v_random_u32 :=
          get_byte(
            uuid_send(v_entropy),
            0
          )::bigint
          * 16777216
        +
          get_byte(
            uuid_send(v_entropy),
            1
          )::bigint
          * 65536
        +
          get_byte(
            uuid_send(v_entropy),
            2
          )::bigint
          * 256
        +
          get_byte(
            uuid_send(v_entropy),
            3
          )::bigint;

      v_random_fraction :=
        v_random_u32::numeric
        /
        4294967296::numeric;

      v_initial_wind :=
        v_wind_min
        +
        (
          (
            v_wind_max -
            v_wind_min
          )
          *
          v_random_fraction
        );
    END IF;
  END IF;

  IF v_initial_wind =
       'NaN'::numeric
     OR v_initial_wind <
       v_wind_min
     OR v_initial_wind >
       v_wind_max
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_WIND_INVALID';
  END IF;


  -- ===================================================
  -- DURABLE WORLD SNAPSHOT
  -- ===================================================

  v_initialized_at :=
    clock_timestamp();

  INSERT INTO
    public.cing_artillery_combat_world_states (
      id,
      combat_state_id,
      match_runtime_id,
      match_id,
      map_id,
      spawn_pair_id,
      player_one_side,
      player_two_side,
      player_one_x,
      player_one_y,
      player_two_x,
      player_two_y,
      initial_wind,
      initial_wind_scaled,
      initialized_at
    )
  VALUES (
    gen_random_uuid(),
    v_combat.id,
    v_combat.match_runtime_id,
    v_combat.match_id,
    v_map.id,
    v_spawn.id,
    v_player_one_side,
    v_player_two_side,
    v_player_one_x,
    v_player_one_y,
    v_player_two_x,
    v_player_two_y,
    v_initial_wind,
    v_initial_wind_scaled,
    v_initialized_at
  )
  RETURNING *
  INTO v_world;


  -- ===================================================
  -- PERSISTENCE POSTCONDITION
  -- ===================================================

  IF v_world.id IS NULL
     OR v_world.combat_state_id <>
        v_combat.id
     OR v_world.match_runtime_id <>
        v_combat.match_runtime_id
     OR v_world.match_id <>
        v_combat.match_id
     OR v_world.map_id <>
        v_map.id
     OR v_world.spawn_pair_id <>
        v_spawn.id
     OR v_world.player_one_side <>
        v_player_one_side
     OR v_world.player_two_side <>
        v_player_two_side
     OR v_world.player_one_x <>
        v_player_one_x
     OR v_world.player_one_y <>
        v_player_one_y
     OR v_world.player_two_x <>
        v_player_two_x
     OR v_world.player_two_y <>
        v_player_two_y
     OR v_world.initial_wind <>
        v_initial_wind
     OR v_world.initial_wind_scaled
        IS DISTINCT FROM
        v_initial_wind_scaled
     OR v_world.initialized_at <>
        v_initialized_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_WORLD_PERSISTENCE_INCONSISTENT';
  END IF;

  RETURN v_world;
END;
$$;


CREATE OR REPLACE FUNCTION
  public.cing_artillery_get_or_create_turn_state_atomic(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_turn_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_state
    public.cing_artillery_turn_states%ROWTYPE;

  v_config jsonb;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;

  -- Defense in depth:
  -- service-role RPC cannot bypass the dark feature gate.
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



  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;


  -- Effective gameplay progression:
  -- both canonical participants must retain access.
  IF NOT
    public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
      v_combat.player_one_account_id,
      v_combat.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;

IF v_combat.status <>
       'initialized'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_TURN_ELIGIBLE';
  END IF;

  -- Turn authority depends on a complete immutable
  -- combat rule snapshot, but does not duplicate it.
  IF v_combat.rules_version IS NULL
     OR v_combat.rules_version <= 0
     OR v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'turn_duration_ms'
        ) <> 'number'
     OR (
          v_combat.rules_snapshot ->>
            'turn_duration_ms'
        )::numeric <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_TURN_ELIGIBLE';
  END IF;

  SELECT s.*
  INTO v_state
  FROM public.cing_artillery_turn_states AS s
  WHERE s.combat_state_id =
    v_combat.id;

  IF FOUND THEN
    IF v_state.match_runtime_id <>
         v_combat.match_runtime_id
       OR v_state.match_id <>
         v_combat.match_id
       OR v_state.player_one_account_id <>
         v_combat.player_one_account_id
       OR v_state.player_one_session_id <>
         v_combat.player_one_session_id
       OR v_state.player_two_account_id <>
         v_combat.player_two_account_id
       OR v_state.player_two_session_id <>
         v_combat.player_two_session_id
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TURN_STATE_INCONSISTENT';
    END IF;

    RETURN v_state;
  END IF;

  INSERT INTO public.cing_artillery_turn_states (
    id,
    combat_state_id,
    match_runtime_id,
    match_id,
    player_one_account_id,
    player_one_session_id,
    player_two_account_id,
    player_two_session_id,
    status,
    turn_number
  )
  VALUES (
    gen_random_uuid(),
    v_combat.id,
    v_combat.match_runtime_id,
    v_combat.match_id,
    v_combat.player_one_account_id,
    v_combat.player_one_session_id,
    v_combat.player_two_account_id,
    v_combat.player_two_session_id,
    'pending',
    0
  )
  ON CONFLICT (
    combat_state_id
  )
  DO NOTHING
  RETURNING *
  INTO v_state;

  IF v_state.id IS NULL THEN
    SELECT s.*
    INTO v_state
    FROM public.cing_artillery_turn_states AS s
    WHERE s.combat_state_id =
      v_combat.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TURN_STATE_RESOLUTION_FAILED';
    END IF;
  END IF;

  IF v_state.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_state.match_id <>
       v_combat.match_id
     OR v_state.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_state.player_one_session_id <>
       v_combat.player_one_session_id
     OR v_state.player_two_account_id <>
       v_combat.player_two_account_id
     OR v_state.player_two_session_id <>
       v_combat.player_two_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_INCONSISTENT';
  END IF;

  RETURN v_state;
END;
$$;


CREATE OR REPLACE FUNCTION
  public.cing_artillery_activate_first_turn_atomic(
    p_combat_state_id uuid
  )
RETURNS public.cing_artillery_turn_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_turn
    public.cing_artillery_turn_states%ROWTYPE;

  v_config jsonb;

  v_player_one_speed integer;
  v_player_two_speed integer;

  v_turn_duration_ms numeric;

  v_winner_account_id uuid;
  v_winner_session_id uuid;

  v_initiative_reason text;

  v_started_at timestamptz;
  v_deadline_at timestamptz;

  v_tiebreak_byte integer;
BEGIN
  IF p_combat_state_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_ID_REQUIRED';
  END IF;

  -- Defense in depth:
  -- service-role RPC cannot bypass the dark feature gate.
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



  /*
   * Lock order is canonical:
   *
   *   combat state
   *       ->
   *   turn state
   *
   * This matches turn-state initialization and ensures
   * concurrent initiative attempts serialize before the
   * random tie-break can ever be evaluated.
   */
  SELECT c.*
  INTO v_combat
  FROM public.cing_artillery_combat_states AS c
  WHERE c.id =
    p_combat_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;


  -- Effective gameplay progression:
  -- both canonical participants must retain access.
  IF NOT
    public.cing_artillery_participants_have_effective_gameplay_access_private_v1(
      v_combat.player_one_account_id,
      v_combat.player_two_account_id
    )
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'cing_artillery_disabled';
  END IF;

IF v_combat.status <>
       'initialized'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_TURN_ELIGIBLE';
  END IF;

  SELECT t.*
  INTO v_turn
  FROM public.cing_artillery_turn_states AS t
  WHERE t.combat_state_id =
    v_combat.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_TURN_STATE_NOT_FOUND';
  END IF;

  -- Durable participant authority must remain identical.
  IF v_turn.match_runtime_id <>
       v_combat.match_runtime_id
     OR v_turn.match_id <>
       v_combat.match_id
     OR v_turn.player_one_account_id <>
       v_combat.player_one_account_id
     OR v_turn.player_one_session_id <>
       v_combat.player_one_session_id
     OR v_turn.player_two_account_id <>
       v_combat.player_two_account_id
     OR v_turn.player_two_session_id <>
       v_combat.player_two_session_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_STATE_INCONSISTENT';
  END IF;

  /*
   * Idempotent re-entry.
   *
   * Once ACTIVE, initiative is already canonical.
   * Do not recompute speed, time or tie-break.
   */
  IF v_turn.status = 'active' THEN
    /*
     * Initiative activation is idempotent for the entire
     * active combat lifecycle, not only while turn #1 is
     * current.
     *
     * Rejoin/reconnect may trigger another start attempt
     * after later turn transitions. Once ACTIVE, initiative
     * must never reroll or reset the canonical turn timer.
     */
    IF v_turn.turn_number <= 0
       OR v_turn.active_account_id IS NULL
       OR v_turn.active_session_id IS NULL
       OR v_turn.initiative_reason NOT IN (
            'speed',
            'speed_tiebreak'
          )
       OR v_turn.turn_started_at IS NULL
       OR v_turn.turn_deadline_at IS NULL
       OR v_turn.turn_deadline_at <=
          v_turn.turn_started_at
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_INITIATIVE_STATE_INCONSISTENT';
    END IF;

    RETURN v_turn;
  END IF;

  IF v_turn.status <> 'pending'
     OR v_turn.turn_number <> 0
     OR v_turn.active_account_id IS NOT NULL
     OR v_turn.active_session_id IS NOT NULL
     OR v_turn.initiative_reason IS NOT NULL
     OR v_turn.turn_started_at IS NOT NULL
     OR v_turn.turn_deadline_at IS NOT NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_STATE_INCONSISTENT';
  END IF;

  -- Validate immutable speed snapshots before casting.
  IF v_combat.player_one_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.player_one_stats_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.player_one_stats_snapshot ->
            'speed'
        ) <> 'number'
     OR (
          v_combat.player_one_stats_snapshot ->>
            'speed'
        ) !~ '^[1-9][0-9]*$'
     OR (
          v_combat.player_one_stats_snapshot ->>
            'speed'
        )::numeric > 2147483647
     OR v_combat.player_two_stats_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.player_two_stats_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.player_two_stats_snapshot ->
            'speed'
        ) <> 'number'
     OR (
          v_combat.player_two_stats_snapshot ->>
            'speed'
        ) !~ '^[1-9][0-9]*$'
     OR (
          v_combat.player_two_stats_snapshot ->>
            'speed'
        )::numeric > 2147483647
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_COMBAT_STATS_INVALID';
  END IF;

  v_player_one_speed :=
    (
      v_combat.player_one_stats_snapshot ->>
        'speed'
    )::integer;

  v_player_two_speed :=
    (
      v_combat.player_two_stats_snapshot ->>
        'speed'
    )::integer;

  -- Timer authority comes only from immutable match rules.
  IF v_combat.rules_snapshot IS NULL
     OR jsonb_typeof(
          v_combat.rules_snapshot
        ) <> 'object'
     OR jsonb_typeof(
          v_combat.rules_snapshot ->
            'turn_duration_ms'
        ) <> 'number'
     OR (
          v_combat.rules_snapshot ->>
            'turn_duration_ms'
        )::numeric <= 0
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_RULES_INVALID';
  END IF;

  v_turn_duration_ms :=
    (
      v_combat.rules_snapshot ->>
        'turn_duration_ms'
    )::numeric;

  IF v_player_one_speed >
       v_player_two_speed
  THEN
    v_winner_account_id :=
      v_combat.player_one_account_id;

    v_winner_session_id :=
      v_combat.player_one_session_id;

    v_initiative_reason :=
      'speed';

  ELSIF v_player_two_speed >
        v_player_one_speed
  THEN
    v_winner_account_id :=
      v_combat.player_two_account_id;

    v_winner_session_id :=
      v_combat.player_two_session_id;

    v_initiative_reason :=
      'speed';

  ELSE
    /*
     * Secure tie-break.
     *
     * gen_random_uuid() is generated by PostgreSQL using
     * cryptographically strong randomness. uuid_send()
     * exposes the UUID bytes; only the lowest bit is needed.
     *
     * Crucially this branch executes only while holding the
     * canonical combat + turn locks. Once persisted, later
     * callers return ACTIVE above and never reroll.
     */
    v_tiebreak_byte :=
      get_byte(
        uuid_send(
          gen_random_uuid()
        ),
        0
      );

    IF (
      v_tiebreak_byte % 2
    ) = 0 THEN
      v_winner_account_id :=
        v_combat.player_one_account_id;

      v_winner_session_id :=
        v_combat.player_one_session_id;
    ELSE
      v_winner_account_id :=
        v_combat.player_two_account_id;

      v_winner_session_id :=
        v_combat.player_two_session_id;
    END IF;

    v_initiative_reason :=
      'speed_tiebreak';
  END IF;

  -- PostgreSQL clock is authoritative for the first turn.
  v_started_at :=
    clock_timestamp();

  v_deadline_at :=
    v_started_at +
    (
      v_turn_duration_ms::double precision *
      interval '1 millisecond'
    );

  IF v_deadline_at <=
       v_started_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_RULES_INVALID';
  END IF;

  UPDATE public.cing_artillery_turn_states
  SET
    status =
      'active',

    turn_number =
      1,

    active_account_id =
      v_winner_account_id,

    active_session_id =
      v_winner_session_id,

    initiative_reason =
      v_initiative_reason,

    turn_started_at =
      v_started_at,

    turn_deadline_at =
      v_deadline_at,

    updated_at =
      v_started_at
  WHERE id =
    v_turn.id
  RETURNING *
  INTO v_turn;

  IF v_turn.id IS NULL
     OR v_turn.status <> 'active'
     OR v_turn.turn_number <> 1
     OR v_turn.active_account_id <>
        v_winner_account_id
     OR v_turn.active_session_id <>
        v_winner_session_id
     OR v_turn.initiative_reason <>
        v_initiative_reason
     OR v_turn.turn_started_at <>
        v_started_at
     OR v_turn.turn_deadline_at <>
        v_deadline_at
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_INITIATIVE_STATE_INCONSISTENT';
  END IF;

  RETURN v_turn;
END;
$$;



-- =====================================================
-- APPLICATION ACL REASSERTION
-- =====================================================

REVOKE ALL
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
TO service_role;


DO $acl$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'cing_artillery_get_or_create_match_runtime_atomic',
    'cing_artillery_get_or_create_combat_state_atomic',
    'cing_artillery_get_or_create_combat_vital_state_atomic',
    'cing_artillery_get_or_create_combat_world_atomic',
    'cing_artillery_get_or_create_turn_state_atomic',
    'cing_artillery_activate_first_turn_atomic'
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(uuid) FROM PUBLIC',
      v_name
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(uuid) FROM anon',
      v_name
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(uuid) FROM authenticated',
      v_name
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(uuid) FROM service_role',
      v_name
    );

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(uuid) TO service_role',
      v_name
    );
  END LOOP;
END;
$acl$;



COMMIT;
