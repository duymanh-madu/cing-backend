BEGIN;

CREATE TABLE IF NOT EXISTS
  public.cing_artillery_shot_trajectory_presentations (
    resolution_id uuid PRIMARY KEY
      REFERENCES public.cing_artillery_shot_resolutions(id)
      ON DELETE RESTRICT,

    execution_id uuid NOT NULL UNIQUE,

    presentation_version integer NOT NULL,
    physics_fixed_scale bigint NOT NULL,

    sample_stride integer NOT NULL,
    sample_count integer NOT NULL,

    samples jsonb NOT NULL,

    created_at timestamptz NOT NULL,

    CONSTRAINT
      cing_artillery_shot_trajectory_presentations_version_v1
      CHECK (
        presentation_version = 1
      ),

    CONSTRAINT
      cing_artillery_shot_trajectory_presentations_scale_v1
      CHECK (
        physics_fixed_scale > 0
      ),

    CONSTRAINT
      cing_artillery_shot_trajectory_presentations_stride_v1
      CHECK (
        sample_stride > 0
      ),

    CONSTRAINT
      cing_artillery_shot_trajectory_presentations_count_v1
      CHECK (
        sample_count BETWEEN 1 AND 256
      ),

    CONSTRAINT
      cing_artillery_shot_trajectory_presentations_samples_array_v1
      CHECK (
        jsonb_typeof(samples) = 'array'
      )
  );


ALTER TABLE
  public.cing_artillery_shot_trajectory_presentations
ENABLE ROW LEVEL SECURITY;


REVOKE ALL
ON TABLE
  public.cing_artillery_shot_trajectory_presentations
FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION
  public.cing_artillery_commit_resolution_with_trajectory_fenced_atomic_v1(
    p_execution_id uuid,
    p_claim_token uuid,

    p_physics_version integer,
    p_outcome text,

    p_impact_exact_version integer,
    p_impact_physics_fixed_scale bigint,

    p_impact_start_x_scaled bigint,
    p_impact_start_y_scaled bigint,
    p_impact_delta_x_scaled bigint,
    p_impact_delta_y_scaled bigint,

    p_impact_contact_kind text,
    p_impact_contact_numerator numeric,
    p_impact_contact_denominator numeric,
    p_impact_contact_a numeric,
    p_impact_contact_b numeric,
    p_impact_contact_discriminant numeric,

    p_impact_projection_version integer,
    p_impact_x numeric,
    p_impact_y numeric,

    p_target_account_id uuid,
    p_damage numeric,

    p_trajectory_presentation jsonb
  )
RETURNS public.cing_artillery_shot_resolutions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_resolution
    public.cing_artillery_shot_resolutions%ROWTYPE;

  v_existing
    public.cing_artillery_shot_trajectory_presentations%ROWTYPE;

  v_version integer;
  v_scale bigint;
  v_stride integer;
  v_count integer;

  v_samples jsonb;
  v_sample jsonb;
  v_ordinality bigint;

  v_step numeric;
  v_elapsed numeric;

  v_previous_step numeric;
  v_previous_elapsed numeric;

  v_key_count integer;
  v_now timestamptz;
BEGIN
  IF p_trajectory_presentation IS NULL
     OR jsonb_typeof(
       p_trajectory_presentation
     ) <> 'object'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_PRESENTATION_INVALID_V1';
  END IF;


  IF jsonb_typeof(
       p_trajectory_presentation -> 'version'
     ) <> 'number'
     OR (
       p_trajectory_presentation ->> 'version'
     ) !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_PRESENTATION_VERSION_INVALID_V1';
  END IF;

  v_version =
    (
      p_trajectory_presentation ->> 'version'
    )::integer;

  IF v_version <> 1 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_PRESENTATION_VERSION_UNSUPPORTED_V1';
  END IF;


  IF jsonb_typeof(
       p_trajectory_presentation -> 'physics_fixed_scale'
     ) <> 'string'
     OR (
       p_trajectory_presentation ->> 'physics_fixed_scale'
     ) !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_PRESENTATION_SCALE_INVALID_V1';
  END IF;

  v_scale =
    (
      p_trajectory_presentation ->> 'physics_fixed_scale'
    )::bigint;


  IF jsonb_typeof(
       p_trajectory_presentation -> 'sample_stride'
     ) <> 'number'
     OR (
       p_trajectory_presentation ->> 'sample_stride'
     ) !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_PRESENTATION_STRIDE_INVALID_V1';
  END IF;

  v_stride =
    (
      p_trajectory_presentation ->> 'sample_stride'
    )::integer;


  IF jsonb_typeof(
       p_trajectory_presentation -> 'sample_count'
     ) <> 'number'
     OR (
       p_trajectory_presentation ->> 'sample_count'
     ) !~ '^[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_PRESENTATION_COUNT_INVALID_V1';
  END IF;

  v_count =
    (
      p_trajectory_presentation ->> 'sample_count'
    )::integer;

  IF v_count < 1
     OR v_count > 256
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_PRESENTATION_COUNT_OUT_OF_RANGE_V1';
  END IF;


  v_samples =
    p_trajectory_presentation -> 'samples';

  IF jsonb_typeof(
       v_samples
     ) <> 'array'
     OR jsonb_array_length(
       v_samples
     ) <> v_count
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_COUNT_MISMATCH_V1';
  END IF;


  FOR
    v_sample,
    v_ordinality
  IN
    SELECT
      value,
      ordinality
    FROM
      jsonb_array_elements(
        v_samples
      )
      WITH ORDINALITY
  LOOP
    IF jsonb_typeof(
         v_sample
       ) <> 'object'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_INVALID_V1';
    END IF;


    SELECT
      count(*)
    INTO
      v_key_count
    FROM
      jsonb_object_keys(
        v_sample
      );

    IF v_key_count <> 4
       OR NOT (
         v_sample
         ?& ARRAY[
           'step_index',
           'elapsed_ms',
           'x_scaled',
           'y_scaled'
         ]
       )
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TRAJECTORY_PRESENTATION_SAMPLE_SHAPE_INVALID_V1';
    END IF;


    IF jsonb_typeof(
         v_sample -> 'step_index'
       ) <> 'number'
       OR (
         v_sample ->> 'step_index'
       ) !~ '^(0|[1-9][0-9]*)$'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TRAJECTORY_PRESENTATION_STEP_INVALID_V1';
    END IF;

    v_step =
      (
        v_sample ->> 'step_index'
      )::numeric;


    IF jsonb_typeof(
         v_sample -> 'elapsed_ms'
       ) <> 'number'
       OR (
         v_sample ->> 'elapsed_ms'
       ) !~ '^(0|[1-9][0-9]*)$'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TRAJECTORY_PRESENTATION_TIME_INVALID_V1';
    END IF;

    v_elapsed =
      (
        v_sample ->> 'elapsed_ms'
      )::numeric;


    IF jsonb_typeof(
         v_sample -> 'x_scaled'
       ) <> 'string'
       OR (
         v_sample ->> 'x_scaled'
       ) !~ '^-?(0|[1-9][0-9]*)$'
       OR (
         v_sample ->> 'x_scaled'
       ) = '-0'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TRAJECTORY_PRESENTATION_X_INVALID_V1';
    END IF;


    IF jsonb_typeof(
         v_sample -> 'y_scaled'
       ) <> 'string'
       OR (
         v_sample ->> 'y_scaled'
       ) !~ '^-?(0|[1-9][0-9]*)$'
       OR (
         v_sample ->> 'y_scaled'
       ) = '-0'
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TRAJECTORY_PRESENTATION_Y_INVALID_V1';
    END IF;


    IF v_ordinality = 1 THEN
      IF v_step <> 0
         OR v_elapsed <> 0
      THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE =
              'CING_ARTILLERY_TRAJECTORY_PRESENTATION_ORIGIN_INVALID_V1';
      END IF;
    ELSE
      IF v_step <=
           v_previous_step
         OR v_elapsed <=
           v_previous_elapsed
      THEN
        RAISE EXCEPTION
          USING
            ERRCODE = 'P0001',
            MESSAGE =
              'CING_ARTILLERY_TRAJECTORY_PRESENTATION_ORDER_INVALID_V1';
      END IF;
    END IF;

    v_previous_step =
      v_step;

    v_previous_elapsed =
      v_elapsed;
  END LOOP;


  SELECT *
  INTO v_resolution
  FROM
    public.cing_artillery_commit_resolution_fenced_atomic(
      p_execution_id,
      p_claim_token,

      p_physics_version,
      p_outcome,

      p_impact_exact_version,
      p_impact_physics_fixed_scale,

      p_impact_start_x_scaled,
      p_impact_start_y_scaled,
      p_impact_delta_x_scaled,
      p_impact_delta_y_scaled,

      p_impact_contact_kind,
      p_impact_contact_numerator,
      p_impact_contact_denominator,
      p_impact_contact_a,
      p_impact_contact_b,
      p_impact_contact_discriminant,

      p_impact_projection_version,
      p_impact_x,
      p_impact_y,

      p_target_account_id,
      p_damage
    );


  IF v_resolution.id IS NULL
     OR v_resolution.execution_id <>
       p_execution_id
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE =
          'CING_ARTILLERY_TRAJECTORY_RESOLUTION_IDENTITY_INVALID_V1';
  END IF;


  SELECT t.*
  INTO v_existing
  FROM
    public.cing_artillery_shot_trajectory_presentations AS t
  WHERE
    t.resolution_id =
      v_resolution.id
  FOR UPDATE;


  IF FOUND THEN
    IF v_existing.execution_id <>
         v_resolution.execution_id
       OR v_existing.presentation_version <>
         v_version
       OR v_existing.physics_fixed_scale <>
         v_scale
       OR v_existing.sample_stride <>
         v_stride
       OR v_existing.sample_count <>
         v_count
       OR v_existing.samples <>
         v_samples
    THEN
      RAISE EXCEPTION
        USING
          ERRCODE = 'P0001',
          MESSAGE =
            'CING_ARTILLERY_TRAJECTORY_PRESENTATION_RETRY_CONFLICT_V1';
    END IF;

    RETURN v_resolution;
  END IF;


  v_now =
    clock_timestamp();


  INSERT INTO
    public.cing_artillery_shot_trajectory_presentations (
      resolution_id,
      execution_id,
      presentation_version,
      physics_fixed_scale,
      sample_stride,
      sample_count,
      samples,
      created_at
    )
  VALUES (
    v_resolution.id,
    v_resolution.execution_id,
    v_version,
    v_scale,
    v_stride,
    v_count,
    v_samples,
    v_now
  );


  RETURN v_resolution;
END;
$$;


REVOKE ALL
ON FUNCTION
  public.cing_artillery_commit_resolution_with_trajectory_fenced_atomic_v1(
    uuid,
    uuid,
    integer,
    text,
    integer,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer,
    numeric,
    numeric,
    uuid,
    numeric,
    jsonb
  )
FROM PUBLIC, anon, authenticated;


GRANT EXECUTE
ON FUNCTION
  public.cing_artillery_commit_resolution_with_trajectory_fenced_atomic_v1(
    uuid,
    uuid,
    integer,
    text,
    integer,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    text,
    numeric,
    numeric,
    numeric,
    numeric,
    numeric,
    integer,
    numeric,
    numeric,
    uuid,
    numeric,
    jsonb
  )
TO service_role;

COMMIT;
