begin;

do $$
declare
  v_config jsonb;
  v_games jsonb;
  v_existing jsonb;
begin
  select game_economy_config
    into v_config
  from public.app_configs
  where id = 1
  for update;

  if v_config is null then
    raise exception 'GAME_ECONOMY_CONFIG_UNAVAILABLE';
  end if;

  v_games :=
    coalesce(
      v_config -> 'games',
      '{}'::jsonb
    );

  v_existing :=
    v_games -> 'cing-block-puzzle';

  /*
   * Fail closed if a conflicting definition already exists.
   * Re-running the exact intended policy remains idempotent.
   */
  if v_existing is not null then
    if
      coalesce(v_existing ->> 'economy_type', '') <> 'paid_offline'
    then
      raise exception
        'CING_BLOCK_PUZZLE_ECONOMY_POLICY_CONFLICT';
    end if;

    return;
  end if;

  v_games :=
    jsonb_set(
      v_games,
      '{cing-block-puzzle}',
      jsonb_build_object(
        'aliases',
        jsonb_build_array(
          'Cing Block Puzzle'
        ),
        'economy_type',
        'paid_offline'
      ),
      true
    );

  v_config :=
    jsonb_set(
      v_config,
      '{games}',
      v_games,
      true
    );

  update public.app_configs
  set game_economy_config =
    v_config
  where id = 1;

  if not found then
    raise exception
      'APP_CONFIG_ROW_NOT_FOUND';
  end if;
end;
$$;

commit;
