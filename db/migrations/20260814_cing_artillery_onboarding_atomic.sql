BEGIN;

-- =====================================================
-- CING ARTILLERY — ATOMIC CHARACTER ONBOARDING
--
-- Principles:
--   PostgreSQL owns onboarding atomicity
--   runtime configuration owns starter inventory
--   no starter cosmetic is hardcoded in application code
--   account + identity + starter inventory/loadout commit together
--   retries are idempotent
--   existing loadout is never overwritten by onboarding retries
--   no combat/economy/ranking advantage is introduced here
--   function remains private to service_role
-- =====================================================

-- -----------------------------------------------------
-- Production config schema
--
-- Existing production:
-- {
--   "enabled": false,
--   "version": 1
-- }
--
-- Extended non-destructively to:
-- {
--   "enabled": false,
--   "version": 1,
--   "starter": {
--     "version": 1,
--     "items": []
--   }
-- }
--
-- Starter item shape when real assets are configured:
-- {
--   "item_key": "...",
--   "item_type": "...",
--   "equip": true|false
-- }
--
-- Empty items are intentional until real production assets
-- are approved. No mock/default cosmetic identity is invented.
-- -----------------------------------------------------

UPDATE public.app_configs
SET cing_artillery_config =
  jsonb_set(
    COALESCE(
      cing_artillery_config,
      '{}'::jsonb
    ),
    '{starter}',
    jsonb_build_object(
      'version',
      1,
      'items',
      '[]'::jsonb
    ),
    true
  )
WHERE id = 1
  AND NOT (
    COALESCE(
      cing_artillery_config,
      '{}'::jsonb
    ) ? 'starter'
  );

-- =====================================================
-- ATOMIC ONBOARDING RPC
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

  -- Defense in depth:
  -- repository/RPC cannot bypass the dark feature gate.
  IF NOT (
    v_config ->> 'enabled'
  )::boolean THEN
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

-- Private server-side RPC only.
REVOKE ALL
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION
  public.onboard_cing_artillery_character_atomic(
    text,
    text,
    text
  )
TO service_role;

COMMIT;
