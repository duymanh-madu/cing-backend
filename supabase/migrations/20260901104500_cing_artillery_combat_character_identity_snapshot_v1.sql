BEGIN;

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_combat_character_snapshots (
    id uuid PRIMARY KEY
      DEFAULT gen_random_uuid(),

    combat_state_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_combat_states(id)
      ON DELETE CASCADE,

    match_runtime_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_match_runtimes(id),

    match_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_matches(id),

    participant_slot text NOT NULL,

    account_id uuid NOT NULL,

    character_key text NOT NULL,

    character_name text NOT NULL,

    gender text NOT NULL,

    snapshotted_at timestamptz NOT NULL
      DEFAULT clock_timestamp(),

    CONSTRAINT
      cing_artillery_combat_character_snapshot_slot_chk
      CHECK (
        participant_slot IN (
          'player_one',
          'player_two'
        )
      ),

    CONSTRAINT
      cing_artillery_combat_character_snapshot_key_chk
      CHECK (
        character_key =
          btrim(character_key)
        AND length(character_key) > 0
      ),

    CONSTRAINT
      cing_artillery_combat_character_snapshot_name_chk
      CHECK (
        character_name =
          btrim(character_name)
        AND length(character_name) > 0
      ),

    CONSTRAINT
      cing_artillery_combat_character_snapshot_gender_chk
      CHECK (
        gender =
          btrim(gender)
        AND length(gender) > 0
      ),

    CONSTRAINT
      cing_artillery_combat_character_snapshot_slot_uq
      UNIQUE (
        combat_state_id,
        participant_slot
      ),

    CONSTRAINT
      cing_artillery_combat_character_snapshot_account_uq
      UNIQUE (
        combat_state_id,
        account_id
      )
  );


CREATE INDEX IF NOT EXISTS
  cing_artillery_combat_character_snapshot_runtime_idx
ON public.cing_artillery_combat_character_snapshots (
  match_runtime_id
);


CREATE INDEX IF NOT EXISTS
  cing_artillery_combat_character_snapshot_match_idx
ON public.cing_artillery_combat_character_snapshots (
  match_id
);


/*
 * Immutable participant character identity authority.
 *
 * This helper is invoked only by the combat-state INSERT
 * trigger below.
 *
 * It never chooses gameplay stats, HP, initiative,
 * position, terrain, damage or outcome.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_freeze_combat_character_identity_private_v1(
    p_combat_state_id uuid
  )
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combat
    public.cing_artillery_combat_states%ROWTYPE;

  v_player_one
    public.cing_artillery_characters%ROWTYPE;

  v_player_two
    public.cing_artillery_characters%ROWTYPE;

  v_inserted_count integer := 0;
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
    p_combat_state_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_COMBAT_STATE_NOT_FOUND';
  END IF;


  IF v_combat.match_runtime_id IS NULL
     OR v_combat.match_id IS NULL
     OR v_combat.player_one_account_id IS NULL
     OR v_combat.player_two_account_id IS NULL
     OR v_combat.player_one_account_id =
        v_combat.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_CHARACTER_SNAPSHOT_COMBAT_IDENTITY_INVALID';
  END IF;


  /*
   * Canonical deterministic character lock order.
   *
   * The current combat initialization authority already
   * acquires these same rows in account-id order.
   * Re-acquiring them here is safe and keeps this helper
   * independently fail-closed if another legitimate insert
   * path is ever introduced later.
   */
  PERFORM c.account_id
  FROM public.cing_artillery_characters AS c
  WHERE c.account_id IN (
    v_combat.player_one_account_id,
    v_combat.player_two_account_id
  )
  ORDER BY c.account_id
  FOR UPDATE;


  SELECT c.*
  INTO v_player_one
  FROM public.cing_artillery_characters AS c
  WHERE c.account_id =
    v_combat.player_one_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_ONE_CHARACTER_NOT_FOUND';
  END IF;


  SELECT c.*
  INTO v_player_two
  FROM public.cing_artillery_characters AS c
  WHERE c.account_id =
    v_combat.player_two_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_TWO_CHARACTER_NOT_FOUND';
  END IF;


  IF v_player_one.character_key IS NULL
     OR btrim(v_player_one.character_key) = ''
     OR v_player_one.character_name IS NULL
     OR btrim(v_player_one.character_name) = ''
     OR v_player_one.gender IS NULL
     OR btrim(v_player_one.gender) = ''
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_ONE_CHARACTER_IDENTITY_INVALID';
  END IF;


  IF v_player_two.character_key IS NULL
     OR btrim(v_player_two.character_key) = ''
     OR v_player_two.character_name IS NULL
     OR btrim(v_player_two.character_name) = ''
     OR v_player_two.gender IS NULL
     OR btrim(v_player_two.gender) = ''
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_PLAYER_TWO_CHARACTER_IDENTITY_INVALID';
  END IF;


  INSERT INTO
    public.cing_artillery_combat_character_snapshots (
      combat_state_id,
      match_runtime_id,
      match_id,
      participant_slot,
      account_id,
      character_key,
      character_name,
      gender
    )
  VALUES
    (
      v_combat.id,
      v_combat.match_runtime_id,
      v_combat.match_id,
      'player_one',
      v_combat.player_one_account_id,
      v_player_one.character_key,
      v_player_one.character_name,
      v_player_one.gender
    ),
    (
      v_combat.id,
      v_combat.match_runtime_id,
      v_combat.match_id,
      'player_two',
      v_combat.player_two_account_id,
      v_player_two.character_key,
      v_player_two.character_name,
      v_player_two.gender
    );

  GET DIAGNOSTICS
    v_inserted_count =
      ROW_COUNT;

  IF v_inserted_count <> 2 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_CHARACTER_SNAPSHOT_CARDINALITY_INVALID';
  END IF;


  IF (
    SELECT count(*)
    FROM
      public.cing_artillery_combat_character_snapshots AS s
    WHERE s.combat_state_id =
      v_combat.id
  ) <> 2
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_CHARACTER_SNAPSHOT_POSTCONDITION_FAILED';
  END IF;
END;
$$;


/*
 * Combat-state creation is the canonical immutable
 * character-identity freeze boundary.
 *
 * Trigger execution belongs to the same PostgreSQL
 * transaction as combat initialization.
 */
CREATE OR REPLACE FUNCTION
  public.cing_artillery_combat_character_snapshot_trigger_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM
    public.cing_artillery_freeze_combat_character_identity_private_v1(
      NEW.id
    );

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
  cing_artillery_combat_character_snapshot_after_insert_v1
ON public.cing_artillery_combat_states;


CREATE TRIGGER
  cing_artillery_combat_character_snapshot_after_insert_v1
AFTER INSERT
ON public.cing_artillery_combat_states
FOR EACH ROW
EXECUTE FUNCTION
  public.cing_artillery_combat_character_snapshot_trigger_v1();


ALTER TABLE
  public.cing_artillery_combat_character_snapshots
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE
  public.cing_artillery_combat_character_snapshots
FROM PUBLIC;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_character_snapshots
FROM anon;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_character_snapshots
FROM authenticated;

REVOKE ALL
ON TABLE
  public.cing_artillery_combat_character_snapshots
FROM service_role;


/*
 * Service-role may read immutable presentation identity.
 * It may not insert/update/delete snapshots directly.
 */
GRANT SELECT
ON TABLE
  public.cing_artillery_combat_character_snapshots
TO service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_freeze_combat_character_identity_private_v1(
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_freeze_combat_character_identity_private_v1(
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_freeze_combat_character_identity_private_v1(
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_freeze_combat_character_identity_private_v1(
    uuid
  )
FROM service_role;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_combat_character_snapshot_trigger_v1()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_combat_character_snapshot_trigger_v1()
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_combat_character_snapshot_trigger_v1()
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_combat_character_snapshot_trigger_v1()
FROM service_role;


COMMIT;
