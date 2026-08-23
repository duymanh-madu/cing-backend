BEGIN;

-- =====================================================
-- CING PIU PIU / CING ARTILLERY
-- DURABLE RESULT STREAM FOUNDATION V1
--
-- Purpose:
--
--   establish one immutable, monotonically ordered durable
--   stream for canonical shot-resolution publication and
--   reconnect / resume catch-up.
--
-- Canonical gameplay payload remains owned by:
--
--   public.cing_artillery_shot_resolutions
--
-- This stream stores identity + ordering only.
--
-- It intentionally does NOT duplicate:
--
--   physics output
--   exact impact geometry
--   projected impact coordinates
--   outcome
--   target
--   damage
--
-- Therefore there is only one canonical gameplay-result
-- payload authority.
--
-- Transaction semantics:
--
--   every newly inserted canonical shot resolution creates
--   exactly one stream row through an AFTER INSERT trigger.
--
--   Because PostgreSQL triggers participate in the caller's
--   transaction, resolution persistence and stream creation
--   commit or roll back together.
--
-- Completed fenced retries do not insert a second resolution,
-- therefore they cannot allocate a second stream sequence.
--
-- PostgreSQL remains final durable gameplay authority.
-- =====================================================


-- =====================================================
-- MIGRATION / BACKFILL SERIALIZATION
--
-- Prevent a concurrent canonical resolution INSERT from
-- racing between stream creation, trigger creation and the
-- historical backfill.
--
-- Production gameplay is currently dark, but the migration
-- remains correct independently of that deployment state.
-- =====================================================

LOCK TABLE
  public.cing_artillery_shot_resolutions
IN SHARE ROW EXCLUSIVE MODE;


-- =====================================================
-- DURABLE RESULT STREAM
-- =====================================================

CREATE TABLE
  public.cing_artillery_result_stream (
    result_sequence bigint
      GENERATED ALWAYS AS IDENTITY
      PRIMARY KEY,

    resolution_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_shot_resolutions(id)
      ON DELETE RESTRICT,

    execution_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_shot_executions(id)
      ON DELETE RESTRICT,

    shot_command_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_shot_commands(id)
      ON DELETE RESTRICT,

    combat_state_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_combat_states(id)
      ON DELETE RESTRICT,

    turn_state_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_turn_states(id)
      ON DELETE RESTRICT,

    match_runtime_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_match_runtimes(id)
      ON DELETE RESTRICT,

    match_id uuid NOT NULL
      REFERENCES
        public.cing_artillery_matches(id)
      ON DELETE RESTRICT,

    turn_number integer NOT NULL,

    created_at timestamptz NOT NULL,

    CONSTRAINT
      cing_artillery_result_stream_resolution_uidx
      UNIQUE (
        resolution_id
      ),

    CONSTRAINT
      cing_artillery_result_stream_execution_uidx
      UNIQUE (
        execution_id
      ),

    CONSTRAINT
      cing_artillery_result_stream_command_uidx
      UNIQUE (
        shot_command_id
      ),

    CONSTRAINT
      cing_artillery_result_stream_combat_turn_uidx
      UNIQUE (
        combat_state_id,
        turn_number
      ),

    CONSTRAINT
      cing_artillery_result_stream_turn_number_check
      CHECK (
        turn_number > 0
      )
  );


-- =====================================================
-- RESUME / CATCH-UP QUERY SUPPORT
--
-- Canonical resume query:
--
--   WHERE match_id = ?
--     AND result_sequence > ?
--   ORDER BY result_sequence ASC
--   LIMIT ?
--
-- A global sequence is intentional:
--
--   cursor identity is unambiguous across reconnects,
--   while match_id scopes participant-visible results.
-- =====================================================

CREATE INDEX
  cing_artillery_result_stream_match_sequence_idx
ON public.cing_artillery_result_stream (
  match_id,
  result_sequence
);


CREATE INDEX
  cing_artillery_result_stream_runtime_sequence_idx
ON public.cing_artillery_result_stream (
  match_runtime_id,
  result_sequence
);


-- =====================================================
-- APPLICATION SECURITY
--
-- service_role may read the canonical stream.
--
-- No application role may directly:
--
--   INSERT
--   UPDATE
--   DELETE
--
-- Stream mutation is trigger-owned only.
-- =====================================================

ALTER TABLE
  public.cing_artillery_result_stream
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE
  public.cing_artillery_result_stream
FROM PUBLIC;


REVOKE ALL
ON TABLE
  public.cing_artillery_result_stream
FROM anon;


REVOKE ALL
ON TABLE
  public.cing_artillery_result_stream
FROM authenticated;


REVOKE ALL
ON TABLE
  public.cing_artillery_result_stream
FROM service_role;


GRANT SELECT
ON TABLE
  public.cing_artillery_result_stream
TO service_role;


/*
 * Identity sequence is internal mutation authority.
 *
 * Explicitly close direct sequence use from all application
 * roles. The trigger function executes with its hardened
 * owner authority.
 */
REVOKE ALL
ON SEQUENCE
  public.cing_artillery_result_stream_result_sequence_seq
FROM PUBLIC;


REVOKE ALL
ON SEQUENCE
  public.cing_artillery_result_stream_result_sequence_seq
FROM anon;


REVOKE ALL
ON SEQUENCE
  public.cing_artillery_result_stream_result_sequence_seq
FROM authenticated;


REVOKE ALL
ON SEQUENCE
  public.cing_artillery_result_stream_result_sequence_seq
FROM service_role;


-- =====================================================
-- PRIVATE CAPTURE AUTHORITY
-- =====================================================

CREATE OR REPLACE FUNCTION
  public.cing_artillery_capture_result_stream_private_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESULT_STREAM_INSERT_ONLY_V1';
  END IF;


  IF NEW.id IS NULL
     OR NEW.execution_id IS NULL
     OR NEW.shot_command_id IS NULL
     OR NEW.combat_state_id IS NULL
     OR NEW.turn_state_id IS NULL
     OR NEW.match_runtime_id IS NULL
     OR NEW.match_id IS NULL
     OR NEW.turn_number IS NULL
     OR NEW.turn_number <= 0
     OR NEW.resolved_at IS NULL
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESULT_STREAM_RESOLUTION_IDENTITY_INVALID_V1';
  END IF;


  INSERT INTO
    public.cing_artillery_result_stream (
      resolution_id,
      execution_id,
      shot_command_id,
      combat_state_id,
      turn_state_id,
      match_runtime_id,
      match_id,
      turn_number,
      created_at
    )
  VALUES (
    NEW.id,
    NEW.execution_id,
    NEW.shot_command_id,
    NEW.combat_state_id,
    NEW.turn_state_id,
    NEW.match_runtime_id,
    NEW.match_id,
    NEW.turn_number,
    NEW.resolved_at
  );


  RETURN NEW;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_capture_result_stream_private_v1()
FROM PUBLIC, anon, authenticated, service_role;


-- =====================================================
-- CANONICAL RESOLUTION -> RESULT STREAM COUPLING
-- =====================================================

CREATE TRIGGER
  cing_artillery_shot_resolution_result_stream_after_insert_v1
AFTER INSERT
ON public.cing_artillery_shot_resolutions
FOR EACH ROW
EXECUTE FUNCTION
  public.cing_artillery_capture_result_stream_private_v1();


-- =====================================================
-- HISTORICAL BACKFILL
--
-- The source table is locked above, so no canonical INSERT
-- can slip between trigger installation and this snapshot.
--
-- Existing results receive deterministic migration-time
-- ordering by:
--
--   resolved_at
--   created_at
--   id
--
-- Live results after COMMIT continue through the trigger.
--
-- No gameplay payload is copied.
-- =====================================================

INSERT INTO
  public.cing_artillery_result_stream (
    resolution_id,
    execution_id,
    shot_command_id,
    combat_state_id,
    turn_state_id,
    match_runtime_id,
    match_id,
    turn_number,
    created_at
  )
SELECT
  r.id,
  r.execution_id,
  r.shot_command_id,
  r.combat_state_id,
  r.turn_state_id,
  r.match_runtime_id,
  r.match_id,
  r.turn_number,
  r.resolved_at
FROM
  public.cing_artillery_shot_resolutions AS r
ORDER BY
  r.resolved_at ASC,
  r.created_at ASC,
  r.id ASC;


-- =====================================================
-- RESULT STREAM IMMUTABILITY NOTES
--
-- No UPDATE / DELETE mutation authority is introduced.
--
-- No socket, NOTIFY, pg_notify or delivery acknowledgment
-- belongs in this database foundation.
--
-- A later Mắt Bão realtime projector may:
--
--   SELECT stream rows
--   JOIN canonical shot resolutions
--   emit live results
--   serve reconnect catch-up
--
-- without becoming gameplay mutation authority.
-- =====================================================

COMMIT;
