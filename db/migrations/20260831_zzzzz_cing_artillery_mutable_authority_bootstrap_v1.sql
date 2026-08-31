begin;

create or replace function public.cing_artillery_bootstrap_mutable_authority_atomic(
  p_combat_state_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_combat public.cing_artillery_combat_states%rowtype;
  v_world public.cing_artillery_combat_world_states%rowtype;
  v_vital public.cing_artillery_combat_vital_states%rowtype;

  v_terrain public.cing_artillery_combat_terrain_states%rowtype;

  v_player_one_world
    public.cing_artillery_player_world_states%rowtype;

  v_player_two_world
    public.cing_artillery_player_world_states%rowtype;

  v_player_world_count integer;
begin
  if p_combat_state_id is null then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_COMBAT_STATE_REQUIRED'
      using errcode = '22023';
  end if;

  /*
   * Canonical startup lock.
   *
   * Mutable authority may only be established after immutable
   * combat/world/vital authority exists and before first-turn
   * activation exposes the combat to shot execution.
   */
  select *
  into v_combat
  from public.cing_artillery_combat_states
  where id = p_combat_state_id
  for update;

  if not found then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_COMBAT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_combat.status <> 'initialized' then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_COMBAT_NOT_INITIALIZED'
      using errcode = '55000';
  end if;

  select *
  into v_world
  from public.cing_artillery_combat_world_states
  where combat_state_id = p_combat_state_id
  for share;

  if not found then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_WORLD_REQUIRED'
      using errcode = '55000';
  end if;

  if
    v_world.match_runtime_id <> v_combat.match_runtime_id
    or v_world.match_id <> v_combat.match_id
  then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_WORLD_IDENTITY_MISMATCH'
      using errcode = '55000';
  end if;

  select *
  into v_vital
  from public.cing_artillery_combat_vital_states
  where combat_state_id = p_combat_state_id
  for share;

  if not found then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_VITAL_REQUIRED'
      using errcode = '55000';
  end if;

  if
    v_vital.match_runtime_id <> v_combat.match_runtime_id
    or v_vital.match_id <> v_combat.match_id
  then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_VITAL_IDENTITY_MISMATCH'
      using errcode = '55000';
  end if;

  /*
   * The private initializers remain the sole creation authorities.
   * This wrapper supplies one service-facing transaction boundary:
   * either both mutable authorities exist and validate, or none of
   * this bootstrap transaction commits.
   */
  perform
    public.cing_artillery_get_or_create_combat_terrain_private(
      p_combat_state_id
    );

  perform
    public.cing_artillery_get_or_create_player_world_states_private(
      p_combat_state_id
    );

  select *
  into v_terrain
  from public.cing_artillery_combat_terrain_states
  where combat_state_id = p_combat_state_id
  for share;

  if not found then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_TERRAIN_MISSING'
      using errcode = '55000';
  end if;

  if
    v_terrain.match_runtime_id <> v_combat.match_runtime_id
    or v_terrain.match_id <> v_combat.match_id
    or v_terrain.map_id <> v_world.map_id
  then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_TERRAIN_IDENTITY_MISMATCH'
      using errcode = '55000';
  end if;

  select count(*)
  into v_player_world_count
  from public.cing_artillery_player_world_states
  where combat_state_id = p_combat_state_id;

  if v_player_world_count <> 2 then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_PLAYER_WORLD_CARDINALITY_INVALID'
      using errcode = '55000';
  end if;

  select *
  into v_player_one_world
  from public.cing_artillery_player_world_states
  where
    combat_state_id = p_combat_state_id
    and participant_slot = 1
  for share;

  if not found then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_PLAYER_ONE_WORLD_MISSING'
      using errcode = '55000';
  end if;

  select *
  into v_player_two_world
  from public.cing_artillery_player_world_states
  where
    combat_state_id = p_combat_state_id
    and participant_slot = 2
  for share;

  if not found then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_PLAYER_TWO_WORLD_MISSING'
      using errcode = '55000';
  end if;

  if
    v_player_one_world.match_runtime_id <> v_combat.match_runtime_id
    or v_player_one_world.match_id <> v_combat.match_id
    or v_player_one_world.account_id <> v_vital.player_one_account_id
    or v_player_one_world.gameplay_session_id <>
       v_combat.player_one_gameplay_session_id
    or v_player_one_world.motion_state <> 'stable'
  then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_PLAYER_ONE_IDENTITY_MISMATCH'
      using errcode = '55000';
  end if;

  if
    v_player_two_world.match_runtime_id <> v_combat.match_runtime_id
    or v_player_two_world.match_id <> v_combat.match_id
    or v_player_two_world.account_id <> v_vital.player_two_account_id
    or v_player_two_world.gameplay_session_id <>
       v_combat.player_two_gameplay_session_id
    or v_player_two_world.motion_state <> 'stable'
  then
    raise exception
      'CING_ARTILLERY_MUTABLE_BOOTSTRAP_PLAYER_TWO_IDENTITY_MISMATCH'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'combat_state_id', v_combat.id,
    'match_runtime_id', v_combat.match_runtime_id,
    'match_id', v_combat.match_id,
    'terrain_state_id', v_terrain.id,
    'terrain_revision', v_terrain.terrain_revision,
    'player_world_count', v_player_world_count,
    'player_one_world_state_id', v_player_one_world.id,
    'player_two_world_state_id', v_player_two_world.id,
    'ready', true
  );
end;
$function$;

revoke all
on function public.cing_artillery_bootstrap_mutable_authority_atomic(uuid)
from public, anon, authenticated;

grant execute
on function public.cing_artillery_bootstrap_mutable_authority_atomic(uuid)
to service_role;

commit;
