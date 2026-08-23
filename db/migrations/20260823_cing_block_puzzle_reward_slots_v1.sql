begin;

do $$
declare
  v_config jsonb;
  v_games jsonb;
  v_entry jsonb;
  v_rewards jsonb;
begin
  select
    coalesce(
      leaderboard_config,
      '{}'::jsonb
    )
  into v_config
  from public.app_configs
  where id = 1
  for update;

  if not found then
    raise exception
      'CING_BLOCK_PUZZLE_APP_CONFIG_MISSING';
  end if;

  if jsonb_typeof(v_config) <> 'object' then
    raise exception
      'CING_BLOCK_PUZZLE_LEADERBOARD_CONFIG_INVALID';
  end if;

  v_games :=
    coalesce(
      v_config -> 'games',
      '{}'::jsonb
    );

  if jsonb_typeof(v_games) <> 'object' then
    raise exception
      'CING_BLOCK_PUZZLE_LEADERBOARD_GAMES_INVALID';
  end if;

  v_entry :=
    v_games ->
      'cing-block-puzzle';

  if
    v_entry is null
    or jsonb_typeof(v_entry) <> 'object'
  then
    raise exception
      'CING_BLOCK_PUZZLE_LEADERBOARD_ENTRY_MISSING';
  end if;

  v_rewards :=
    v_entry -> 'rewards';

  /*
   * Rewards are commercial/admin-controlled.
   *
   * This migration provisions only the 3 editable
   * rank slots with zero-value placeholders.
   *
   * Any non-empty production reward configuration
   * always wins and is never overwritten.
   */
  if
    v_rewards is null
    or (
      jsonb_typeof(v_rewards) = 'array'
      and jsonb_array_length(v_rewards) = 0
    )
  then
    v_entry :=
      jsonb_set(
        v_entry,
        '{rewards}',
        jsonb_build_array(
          jsonb_build_object(
            'rank', 1,
            'points', 0,
            'label', '🥇 Top 1 tuần'
          ),
          jsonb_build_object(
            'rank', 2,
            'points', 0,
            'label', '🥈 Top 2 tuần'
          ),
          jsonb_build_object(
            'rank', 3,
            'points', 0,
            'label', '🥉 Top 3 tuần'
          )
        ),
        true
      );
  elsif jsonb_typeof(v_rewards) <> 'array' then
    raise exception
      'CING_BLOCK_PUZZLE_REWARDS_CONFIG_INVALID';
  end if;

  v_games :=
    jsonb_set(
      v_games,
      '{cing-block-puzzle}',
      v_entry,
      false
    );

  v_config :=
    jsonb_set(
      v_config,
      '{games}',
      v_games,
      false
    );

  update public.app_configs
  set leaderboard_config =
    v_config
  where id = 1;
end
$$;

commit;
