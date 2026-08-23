begin;

do $$
declare
  v_config jsonb;
  v_games jsonb;
  v_existing jsonb;
  v_block_puzzle jsonb;
begin
  select alltime_games_config
  into v_config
  from public.app_configs
  where id = 1
  for update;

  if not found then
    raise exception
      'app_configs id=1 is required for Cing Block Puzzle alltime provisioning';
  end if;

  v_config := coalesce(v_config, '{}'::jsonb);
  v_games := coalesce(v_config -> 'games', '{}'::jsonb);

  if jsonb_typeof(v_games) <> 'object' then
    raise exception
      'alltime_games_config.games must be a JSON object';
  end if;

  v_existing := v_games -> 'cing-block-puzzle';

  if v_existing is not null
     and jsonb_typeof(v_existing) <> 'object' then
    raise exception
      'existing cing-block-puzzle alltime config must be a JSON object';
  end if;

  v_block_puzzle :=
    jsonb_build_object(
      'enabled', true,
      'display_name', 'Cing Block Puzzle',
      'icon', '🎮',
      'icon_url', '/game-icons/cing-block-puzzle.png',
      'rewards', jsonb_build_array(
        jsonb_build_object(
          'rank', 1,
          'points', 0,
          'label', '🥇 Top 1 all-time'
        ),
        jsonb_build_object(
          'rank', 2,
          'points', 0,
          'label', '🥈 Top 2 all-time'
        ),
        jsonb_build_object(
          'rank', 3,
          'points', 0,
          'label', '🥉 Top 3 all-time'
        )
      )
    );

  if v_existing is not null then
    v_block_puzzle :=
      v_block_puzzle || v_existing;
  end if;

  v_games :=
    jsonb_set(
      v_games,
      '{cing-block-puzzle}',
      v_block_puzzle,
      true
    );

  v_config :=
    jsonb_set(
      v_config,
      '{games}',
      v_games,
      true
    );

  if not (v_config ? 'enabled') then
    v_config :=
      jsonb_set(
        v_config,
        '{enabled}',
        'true'::jsonb,
        true
      );
  end if;

  update public.app_configs
  set alltime_games_config = v_config
  where id = 1;
end
$$;

commit;
