BEGIN;

CREATE OR REPLACE FUNCTION
  public.cing_artillery_read_result_stream_authorized_v2(
    p_match_id uuid,
    p_match_runtime_id uuid,
    p_account_id uuid,
    p_after_sequence text,
    p_limit integer
  )
RETURNS TABLE (
  result_sequence text,
  resolution_id uuid,
  execution_id uuid,
  shot_command_id uuid,
  combat_state_id uuid,
  turn_state_id uuid,
  match_runtime_id uuid,
  match_id uuid,
  turn_number integer,
  physics_version integer,
  outcome text,
  impact_exact_version integer,
  impact_physics_fixed_scale text,
  impact_start_x_scaled text,
  impact_start_y_scaled text,
  impact_delta_x_scaled text,
  impact_delta_y_scaled text,
  impact_contact_kind text,
  impact_contact_numerator text,
  impact_contact_denominator text,
  impact_contact_a text,
  impact_contact_b text,
  impact_contact_discriminant text,
  impact_projection_version integer,
  impact_x text,
  impact_y text,
  target_account_id uuid,
  damage text,
  trajectory_presentation jsonb,
  resolved_at timestamptz,
  resolution_created_at timestamptz,
  stream_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_runtime
    public.cing_artillery_match_runtimes%ROWTYPE;

  v_after_sequence bigint;
BEGIN
  IF p_match_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_MATCH_ID_REQUIRED_V2';
  END IF;

  IF p_match_runtime_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_RUNTIME_ID_REQUIRED_V2';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_ACCOUNT_ID_REQUIRED_V2';
  END IF;


  IF p_after_sequence IS NULL
     OR p_after_sequence = ''
     OR p_after_sequence <>
       btrim(
         p_after_sequence
       )
     OR p_after_sequence !~
       '^(0|[1-9][0-9]*)$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_CURSOR_INVALID_V2';
  END IF;

  BEGIN
    v_after_sequence :=
      p_after_sequence::bigint;
  EXCEPTION
    WHEN numeric_value_out_of_range THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '22023',
          MESSAGE =
            'CING_ARTILLERY_RESULT_READ_CURSOR_OUT_OF_RANGE_V2';
  END;


  IF p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '22023',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_LIMIT_INVALID_V2';
  END IF;


  SELECT
    r.*
  INTO
    v_runtime
  FROM
    public.cing_artillery_match_runtimes AS r
  WHERE
    r.id =
      p_match_runtime_id
    AND r.match_id =
      p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_RUNTIME_NOT_FOUND_V2';
  END IF;


  IF p_account_id IS DISTINCT FROM
       v_runtime.player_one_account_id
     AND
     p_account_id IS DISTINCT FROM
       v_runtime.player_two_account_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE =
          'CING_ARTILLERY_RESULT_READ_ACCESS_DENIED_V2';
  END IF;


  IF EXISTS (
    WITH candidate AS (
      SELECT
        s.*
      FROM
        public.cing_artillery_result_stream AS s
      WHERE
        s.match_id =
          p_match_id
        AND s.match_runtime_id =
          p_match_runtime_id
        AND s.result_sequence >
          v_after_sequence
      ORDER BY
        s.result_sequence ASC
      LIMIT
        p_limit
    )

    SELECT
      1
    FROM
      candidate AS s

    LEFT JOIN
      public.cing_artillery_shot_resolutions AS r
        ON r.id =
          s.resolution_id

    LEFT JOIN
      public.cing_artillery_shot_trajectory_presentations AS t
        ON t.resolution_id =
          s.resolution_id

    WHERE
      r.id IS NULL

      OR r.execution_id IS DISTINCT FROM
           s.execution_id

      OR r.shot_command_id IS DISTINCT FROM
           s.shot_command_id

      OR r.combat_state_id IS DISTINCT FROM
           s.combat_state_id

      OR r.turn_state_id IS DISTINCT FROM
           s.turn_state_id

      OR r.match_runtime_id IS DISTINCT FROM
           s.match_runtime_id

      OR r.match_id IS DISTINCT FROM
           s.match_id

      OR r.turn_number IS DISTINCT FROM
           s.turn_number

      OR t.resolution_id IS NULL

      OR t.execution_id IS DISTINCT FROM
           s.execution_id

      OR t.presentation_version <> 1

      OR t.physics_fixed_scale <= 0

      OR t.sample_stride <= 0

      OR t.sample_count < 1

      OR t.sample_count > 256

      OR jsonb_typeof(
           t.samples
         ) <> 'array'

      OR jsonb_array_length(
           t.samples
         ) <> t.sample_count
  ) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_RESULT_STREAM_TRAJECTORY_INCONSISTENT_V2';
  END IF;


  RETURN QUERY
  SELECT
    s.result_sequence::text,

    r.id,

    r.execution_id,

    r.shot_command_id,

    r.combat_state_id,

    r.turn_state_id,

    r.match_runtime_id,

    r.match_id,

    r.turn_number,

    r.physics_version,

    r.outcome,

    r.impact_exact_version,

    r.impact_physics_fixed_scale::text,

    r.impact_start_x_scaled::text,

    r.impact_start_y_scaled::text,

    r.impact_delta_x_scaled::text,

    r.impact_delta_y_scaled::text,

    r.impact_contact_kind,

    r.impact_contact_numerator::text,

    r.impact_contact_denominator::text,

    r.impact_contact_a::text,

    r.impact_contact_b::text,

    r.impact_contact_discriminant::text,

    r.impact_projection_version,

    r.impact_x::text,

    r.impact_y::text,

    r.target_account_id,

    r.damage::text,

    jsonb_build_object(
      'version',
        t.presentation_version,

      'physics_fixed_scale',
        t.physics_fixed_scale::text,

      'sample_stride',
        t.sample_stride,

      'sample_count',
        t.sample_count,

      'samples',
        t.samples
    ),

    r.resolved_at,

    r.created_at,

    s.created_at

  FROM
    public.cing_artillery_result_stream AS s

  JOIN
    public.cing_artillery_shot_resolutions AS r
      ON r.id =
        s.resolution_id

      AND r.execution_id =
        s.execution_id

      AND r.shot_command_id =
        s.shot_command_id

      AND r.combat_state_id =
        s.combat_state_id

      AND r.turn_state_id =
        s.turn_state_id

      AND r.match_runtime_id =
        s.match_runtime_id

      AND r.match_id =
        s.match_id

      AND r.turn_number =
        s.turn_number

  JOIN
    public.cing_artillery_shot_trajectory_presentations AS t
      ON t.resolution_id =
        r.id

      AND t.execution_id =
        r.execution_id

  WHERE
    s.match_id =
      p_match_id

    AND s.match_runtime_id =
      p_match_runtime_id

    AND s.result_sequence >
      v_after_sequence

  ORDER BY
    s.result_sequence ASC

  LIMIT
    p_limit;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_read_result_stream_authorized_v2(
    uuid,
    uuid,
    uuid,
    text,
    integer
  )
FROM PUBLIC, anon, authenticated, service_role;


GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_read_result_stream_authorized_v2(
    uuid,
    uuid,
    uuid,
    text,
    integer
  )
TO service_role;

COMMIT;
