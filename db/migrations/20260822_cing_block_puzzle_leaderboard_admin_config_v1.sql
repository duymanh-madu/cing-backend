begin;

do $$
declare
  v_config jsonb;
  v_games jsonb;
  v_existing jsonb;
  v_entry jsonb;
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

  /*
   * Provision structural admin policy only.
   * Rewards remain admin-controlled rather than guessing
   * commercial reward values inside a migration.
   */
  v_entry :=
    jsonb_build_object(
      'enabled', false,
      'weekly_reset', true,
      'display_name', 'Cing Block Puzzle',
      'icon', '🧩',
      'rewards', '[]'::jsonb
    );

  v_existing :=
    v_games ->
      'cing-block-puzzle';

  if v_existing is not null then
    if jsonb_typeof(v_existing) <> 'object' then
      raise exception
        'CING_BLOCK_PUZZLE_LEADERBOARD_ENTRY_CONFLICT';
    end if;

    /*
     * Existing production configuration always wins.
     * Only missing structural fields are provisioned.
     */
    v_entry :=
      v_entry ||
      v_existing;
  end if;

  v_games :=
    jsonb_set(
      v_games,
      '{cing-block-puzzle}',
      v_entry,
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
  set leaderboard_config =
    v_config
  where id = 1;
end
$$;

commit;
