begin;

/*
 * CING GAME CENTER V2 — BLOCK PUZZLE FREE START V1
 *
 * Transform the effective start RPC, preserving all
 * existing deterministic version capabilities.
 *
 * Historical paid sessions remain valid.
 * New sessions have play_cost = 0.
 *
 * No start debit, game-play ledger or plays_deducted event.
 * No change to submit, continue or replay authority.
 */

/*
 * Preserve historical play_cost = 1 while permitting
 * new free sessions with play_cost = 0.
 */

alter table public.cing_block_puzzle_sessions
  add constraint
    cing_block_puzzle_sessions_play_cost_free_capability_ck
  check (play_cost in (0, 1))
  not valid;

alter table public.cing_block_puzzle_sessions
  validate constraint
    cing_block_puzzle_sessions_play_cost_free_capability_ck;

alter table public.cing_block_puzzle_sessions
  drop constraint
    cing_block_puzzle_sessions_play_cost_ck;

alter table public.cing_block_puzzle_sessions
  rename constraint
    cing_block_puzzle_sessions_play_cost_free_capability_ck
  to
    cing_block_puzzle_sessions_play_cost_ck;

/*
 * Transform the effective installed RPC.
 *
 * Do not reconstruct the function from its V1 definition:
 * the installed body includes V2/V3/V4 capabilities.
 */

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_lower text;

  v_debit_start integer;
  v_debit_end integer;

  v_ledger_start integer;
  v_ledger_end integer;

  v_removed text;
  v_insert_pattern text;
  v_policy_pattern text;

  v_count integer;
begin
  v_oid := to_regprocedure(
    'public.cing_block_puzzle_start_session_atomic('
    || 'uuid,uuid,text,bigint,integer,integer,integer,integer,integer)'
  );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_FREE_START_RPC_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_oid);

  if v_definition is null then
    raise exception
      'BLOCK_PUZZLE_FREE_START_DEFINITION_UNAVAILABLE';
  end if;

  v_lower := lower(v_definition);

  /*
   * Fail closed if version, replay or existing
   * authoritative economic contract differs.
   */

  if position('p_replay_version = 4' in v_lower) = 0
    or position('p_replay_version = 3' in v_lower) = 0
    or position('p_replay_version = 2' in v_lower) = 0
    or position('game_play_transactions' in v_lower) = 0
    or position('analytics_events' in v_lower) = 0
    or position('for update' in v_lower) = 0
    or position('no_game_plays' in v_lower) = 0
    or position('block_puzzle_play_balance_invariant' in v_lower) = 0
  then
    raise exception
      'BLOCK_PUZZLE_FREE_START_AUTHORITY_MISMATCH';
  end if;

  /*
   * Remove the complete start-only balance mutation,
   * stopping immediately before session insertion.
   *
   * Keep the player existence check, lock and
   * second replay check before this section.
   */

  v_debit_start := strpos(
    v_lower,
    'if coalesce(v_player.game_plays, 0) < 1 then'
  );

  v_debit_end := strpos(
    v_lower,
    'insert into public.cing_block_puzzle_sessions ('
  );

  if v_debit_start = 0
    or v_debit_end <= v_debit_start
  then
    raise exception
      'BLOCK_PUZZLE_FREE_START_DEBIT_BOUNDARY_MISMATCH';
  end if;

  v_removed := substring(
    v_definition
    from v_debit_start
    for v_debit_end - v_debit_start
  );

  if position('NO_GAME_PLAYS' in v_removed) = 0
    or position('game_plays - 1' in v_removed) = 0
    or position('BLOCK_PUZZLE_PLAY_BALANCE_INVARIANT' in v_removed) = 0
  then
    raise exception
      'BLOCK_PUZZLE_FREE_START_DEBIT_SECTION_MISMATCH';
  end if;

  v_definition := overlay(
    v_definition
    placing ''
    from v_debit_start
    for v_debit_end - v_debit_start
  );

  /*
   * Remove only the start-time debit ledger and
   * its analytics compatibility event.
   *
   * Existing rows in both tables remain untouched.
   */

  v_lower := lower(v_definition);

  v_ledger_start := strpos(
    v_lower,
    'insert into public.game_play_transactions ('
  );

  v_ledger_end := strpos(
    v_lower,
    'return v_session;'
  );

  if v_ledger_start = 0
    or v_ledger_end <= v_ledger_start
  then
    raise exception
      'BLOCK_PUZZLE_FREE_START_LEDGER_BOUNDARY_MISMATCH';
  end if;

  v_removed := substring(
    v_definition
    from v_ledger_start
    for v_ledger_end - v_ledger_start
  );

  if position('plays_deducted' in v_removed) = 0
    or position('analytics_events' in v_removed) = 0
    or position('game_play_transactions' in v_removed) = 0
  then
    raise exception
      'BLOCK_PUZZLE_FREE_START_LEDGER_SECTION_MISMATCH';
  end if;

  v_definition := overlay(
    v_definition
    placing ''
    from v_ledger_start
    for v_ledger_end - v_ledger_start
  );

  /*
   * The effective RPC writes the validated replay
   * version immediately before play_cost.
   *
   * Change only this session-insert value.
   */

  v_insert_pattern :=
    'p_replay_version[[:space:]]*,'
    || '[[:space:]]*1[[:space:]]*,'
    || '[[:space:]]*''active''';

  select count(*)
    into v_count
  from regexp_matches(
    v_definition,
    v_insert_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_FREE_START_COST_OCCURRENCE_INVALID';
  end if;

  v_definition := regexp_replace(
    v_definition,
    v_insert_pattern,
    'p_replay_version,'
      || chr(10)
      || '    0,'
      || chr(10)
      || '    ''active''',
    'i'
  );

  /*
   * The installed start RPC still requires paid_offline.
   * New starts must require the explicit free_offline
   * policy, never infer free admission from the client.
   */

  v_policy_pattern :=
    'v_economy_type[[:space:]]*<>[[:space:]]*''paid_offline''';

  select count(*)
    into v_count
  from regexp_matches(
    v_definition,
    v_policy_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_FREE_START_POLICY_GUARD_MISMATCH';
  end if;

  if position(
    'BLOCK_PUZZLE_REQUIRES_PAID_OFFLINE'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_FREE_START_POLICY_ERROR_MISMATCH';
  end if;

  v_definition := regexp_replace(
    v_definition,
    v_policy_pattern,
    'v_economy_type <> ''free_offline''',
    'i'
  );

  v_definition := replace(
    v_definition,
    'BLOCK_PUZZLE_REQUIRES_PAID_OFFLINE',
    'BLOCK_PUZZLE_REQUIRES_FREE_OFFLINE'
  );

  /*
   * Post-transform checks before installing.
   */

  /*
   * Check executable function source, not comments
   * retained by pg_get_functiondef.
   */

  v_lower := lower(
    regexp_replace(
      v_definition,
      '/\*.*?\*/',
      '',
      'gs'
    )
  );

  if position('v_player.game_plays' in v_lower) > 0
    or position('game_play_transactions' in v_lower) > 0
    or position('plays_deducted' in v_lower) > 0
    or position('no_game_plays' in v_lower) > 0
    or position(
      'v_economy_type <> ''free_offline'''
      in v_lower
    ) = 0
    or position(
      'BLOCK_PUZZLE_REQUIRES_FREE_OFFLINE'
      in v_definition
    ) = 0
    or position('p_replay_version = 4' in v_lower) = 0
    or position('p_replay_version = 3' in v_lower) = 0
    or position('p_replay_version = 2' in v_lower) = 0
    or position('for update' in v_lower) = 0
    or position('return v_session;' in v_lower) = 0
  then
    raise exception
      'BLOCK_PUZZLE_FREE_START_POSTCHECK_FAILED';
  end if;

  execute v_definition;
end;
$migration$;

/*
 * Retain private, backend-only RPC execution.
 */

revoke all
on function public.cing_block_puzzle_start_session_atomic(
  uuid,
  uuid,
  text,
  bigint,
  integer,
  integer,
  integer,
  integer,
  integer
)
from public, anon, authenticated;

grant execute
on function public.cing_block_puzzle_start_session_atomic(
  uuid,
  uuid,
  text,
  bigint,
  integer,
  integer,
  integer,
  integer,
  integer
)
to service_role;


/*
 * Atomically switch the three offline game policies.
 *
 * The earlier Tower/Rush Free-start migration must
 * already have installed their zero-debit start RPC.
 *
 * No player balance or transaction history changes.
 */

do $policy$
declare
  v_config jsonb;
  v_games jsonb;
  v_entry jsonb;
  v_key text;
  v_type text;
begin
  select game_economy_config
    into v_config
  from public.app_configs
  where id = 1
  for update;

  if v_config is null then
    raise exception
      'CING_FREE_START_ECONOMY_CONFIG_UNAVAILABLE';
  end if;

  v_games := v_config -> 'games';

  if coalesce(
    jsonb_typeof(v_games),
    ''
  ) <> 'object' then
    raise exception
      'CING_FREE_START_GAMES_CONFIG_INVALID';
  end if;

  foreach v_key in array array[
    'cing-block-puzzle',
    'cing-stack-tower',
    'black-pearl-rush'
  ]
  loop
    v_entry := v_games -> v_key;

    if coalesce(
      jsonb_typeof(v_entry),
      ''
    ) <> 'object' then
      raise exception
        'CING_FREE_START_GAME_POLICY_MISSING: %',
        v_key;
    end if;

    v_type := btrim(
      coalesce(
        v_entry ->> 'economy_type',
        ''
      )
    );

    if v_type not in (
      'paid_offline',
      'free_offline'
    ) then
      raise exception
        'CING_FREE_START_GAME_POLICY_CONFLICT: %',
        v_key;
    end if;

    v_entry := jsonb_set(
      v_entry,
      '{economy_type}',
      '"free_offline"'::jsonb,
      false
    );

    if v_entry ? 'play_cost' then
      v_entry := jsonb_set(
        v_entry,
        '{play_cost}',
        '0'::jsonb,
        false
      );
    end if;

    v_games := jsonb_set(
      v_games,
      array[v_key],
      v_entry,
      false
    );
  end loop;

  v_config := jsonb_set(
    v_config,
    '{games}',
    v_games,
    false
  );

  update public.app_configs
  set game_economy_config = v_config
  where id = 1;

  if not found then
    raise exception
      'CING_FREE_START_APP_CONFIG_UPDATE_FAILED';
  end if;
end;
$policy$;

commit;
