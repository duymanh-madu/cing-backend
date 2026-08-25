begin;

do $$
declare
  v_config_before jsonb;
  v_config_after jsonb;

  v_expected_rules_v1 constant jsonb :=
    '{
      "max_hp": 1000,
      "gravity": 980,
      "version": 1,
      "wind_max": 100,
      "wind_min": -100,
      "power_max": 100,
      "power_min": 0,
      "base_damage": 300,
      "blast_radius": 120,
      "angle_max_deg": 80,
      "angle_min_deg": 10,
      "turn_duration_ms": 15000
    }'::jsonb;

  v_expected_execution_worker constant jsonb :=
    '{
      "enabled": true,
      "version": 1
    }'::jsonb;

  v_rules_v2 constant jsonb :=
    '{
      "version": 2,
      "physics_version": 1,
      "max_hp": 1000,
      "turn_duration_ms": 15000,
      "gravity": 980,
      "wind_min": -100,
      "wind_max": 100,
      "angle_min_deg": 10,
      "angle_max_deg": 80,
      "angle_step_deg": 1,
      "power_min": 0,
      "power_max": 100,
      "power_velocity_scale": 10,
      "physics_step_ms": 10,
      "max_flight_time_ms": 3000,
      "physics_fixed_scale": 1000,
      "trig_algorithm_version": 1,
      "trig_angle_scale": 1000000000,
      "trig_value_scale": 1000000000,
      "projectile_radius_px": 4,
      "player_hit_radius_px": 16,
      "player_hit_center_offset_y_px": 23,
      "muzzle_offset_forward_px": 14,
      "muzzle_offset_up_px": 22,
      "base_damage": 300,
      "blast_radius": 120,
      "blast_min_damage_ratio": 0.1,
      "damage_formula_version": 1,
      "damage_rounding": "floor",
      "self_damage_enabled": false
    }'::jsonb;
begin
  select
    cing_artillery_config
  into
    v_config_before
  from
    public.app_configs
  where
    id = 1
  for update;

  if not found then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_APP_CONFIG_MISSING'
      using errcode = '55000';
  end if;

  if
    v_config_before is null
    or jsonb_typeof(v_config_before) <> 'object'
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_CONFIG_INVALID'
      using errcode = '55000';
  end if;

  if
    v_config_before -> 'enabled'
      is distinct from
      'false'::jsonb
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_ROOT_GATE_NOT_FALSE'
      using errcode = '55000';
  end if;

  if
    v_config_before -> 'execution_worker'
      is distinct from
      v_expected_execution_worker
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_WORKER_BASELINE_MISMATCH'
      using errcode = '55000';
  end if;

  if
    v_config_before -> 'rules'
      is distinct from
      v_expected_rules_v1
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_RULES_V1_BASELINE_MISMATCH'
      using errcode = '55000';
  end if;

  v_config_after :=
    jsonb_set(
      v_config_before,
      '{rules}',
      v_rules_v2,
      false
    );

  if
    (
      v_config_after - 'rules'
    )
      is distinct from
    (
      v_config_before - 'rules'
    )
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_NON_RULES_MUTATION'
      using errcode = '55000';
  end if;

  if
    v_config_after -> 'enabled'
      is distinct from
      'false'::jsonb
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_ROOT_GATE_CHANGED'
      using errcode = '55000';
  end if;

  if
    v_config_after -> 'execution_worker'
      is distinct from
      v_expected_execution_worker
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_WORKER_CHANGED'
      using errcode = '55000';
  end if;

  if
    v_config_after -> 'rules'
      is distinct from
      v_rules_v2
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_V2_MATERIALIZATION_MISMATCH'
      using errcode = '55000';
  end if;

  update
    public.app_configs
  set
    cing_artillery_config =
      v_config_after
  where
    id = 1;

  if not found then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_UPDATE_FAILED'
      using errcode = '55000';
  end if;

  select
    cing_artillery_config
  into
    v_config_after
  from
    public.app_configs
  where
    id = 1;

  if
    v_config_after -> 'rules'
      is distinct from
      v_rules_v2
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_POSTCONDITION_RULES_MISMATCH'
      using errcode = '55000';
  end if;

  if
    v_config_after -> 'enabled'
      is distinct from
      'false'::jsonb
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_POSTCONDITION_ROOT_GATE_CHANGED'
      using errcode = '55000';
  end if;

  if
    v_config_after -> 'execution_worker'
      is distinct from
      v_expected_execution_worker
  then
    raise exception
      'CING_ARTILLERY_RULES_V2_PUBLICATION_POSTCONDITION_WORKER_CHANGED'
      using errcode = '55000';
  end if;
end
$$;

commit;
