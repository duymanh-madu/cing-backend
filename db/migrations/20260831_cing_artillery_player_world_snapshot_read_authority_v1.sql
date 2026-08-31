BEGIN;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_read_player_world_snapshot_internal_v1(
    p_combat_state_id uuid,
    p_match_runtime_id uuid,
    p_match_id uuid
  )
RETURNS TABLE (
  id uuid,
  combat_state_id uuid,
  match_runtime_id uuid,
  match_id uuid,
  gameplay_session_id uuid,
  account_id uuid,
  participant_slot integer,
  position_x integer,
  position_y integer,
  motion_state text,
  initialized_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF
    p_combat_state_id IS NULL OR
    p_match_runtime_id IS NULL OR
    p_match_id IS NULL
  THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_PLAYER_WORLD_SNAPSHOT_IDENTITY_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*)::integer
  INTO
    v_count
  FROM
    public.cing_artillery_player_world_states AS p
  WHERE
    p.combat_state_id =
      p_combat_state_id
    AND p.match_runtime_id =
      p_match_runtime_id
    AND p.match_id =
      p_match_id;

  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'CING_ARTILLERY_PLAYER_WORLD_SNAPSHOT_CARDINALITY_INVALID'
      USING ERRCODE = '55000';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.combat_state_id,
    p.match_runtime_id,
    p.match_id,
    p.gameplay_session_id,
    p.account_id,
    p.participant_slot::integer,
    p.position_x,
    p.position_y,
    p.motion_state::text,
    p.initialized_at,
    p.updated_at
  FROM
    public.cing_artillery_player_world_states AS p
  WHERE
    p.combat_state_id =
      p_combat_state_id
    AND p.match_runtime_id =
      p_match_runtime_id
    AND p.match_id =
      p_match_id
  ORDER BY
    p.participant_slot ASC;
END;
$$;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_player_world_snapshot_internal_v1(
    uuid,
    uuid,
    uuid
  )
FROM PUBLIC;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_player_world_snapshot_internal_v1(
    uuid,
    uuid,
    uuid
  )
FROM anon;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_player_world_snapshot_internal_v1(
    uuid,
    uuid,
    uuid
  )
FROM authenticated;

REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_player_world_snapshot_internal_v1(
    uuid,
    uuid,
    uuid
  )
FROM service_role;

GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_read_player_world_snapshot_internal_v1(
    uuid,
    uuid,
    uuid
  )
TO service_role;

COMMIT;
