begin;

/* ==========================================================
 * CING BLOCK PUZZLE — DETERMINISTIC CONTRACT V2 CAPABILITY
 *
 * This migration DOES NOT activate V2 issuance.
 *
 * It only makes PostgreSQL capable of preserving and accepting
 * the two exact deterministic contracts:
 *
 *   V1 = 1 / 1 / 1 / 1
 *   V2 = 2 / 2 / 2 / 2
 *
 * Mixed tuples remain invalid.
 *
 * Existing V1 sessions/replays remain valid.
 * ========================================================== */


/* ----------------------------------------------------------
 * 1. Session table supports exact V1 OR exact V2.
 * ---------------------------------------------------------- */

alter table public.cing_block_puzzle_sessions
  add constraint
    cing_block_puzzle_sessions_versions_v2_capability_ck
  check (
    (
      engine_version = 1
      and rules_version = 1
      and score_version = 1
      and replay_version = 1
    )
    or
    (
      engine_version = 2
      and rules_version = 2
      and score_version = 2
      and replay_version = 2
    )
  )
  not valid;

alter table public.cing_block_puzzle_sessions
  validate constraint
    cing_block_puzzle_sessions_versions_v2_capability_ck;

alter table public.cing_block_puzzle_sessions
  drop constraint
    cing_block_puzzle_sessions_versions_ck;

alter table public.cing_block_puzzle_sessions
  rename constraint
    cing_block_puzzle_sessions_versions_v2_capability_ck
  to
    cing_block_puzzle_sessions_versions_ck;


/* ----------------------------------------------------------
 * 2. Upgrade the LATEST effective start-session RPC in place.
 *
 * IMPORTANT:
 * - Do not reconstruct it from an old migration.
 * - Preserve ledger / analytics / locking / idempotency logic.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_before text;
  v_count integer;

  v_guard_pattern text :=
    'if[[:space:]]+p_engine_version <> 1'
    || '[[:space:]]+or p_rules_version <> 1'
    || '[[:space:]]+or p_score_version <> 1'
    || '[[:space:]]+or p_replay_version <> 1'
    || '[[:space:]]+then';

  v_insert_pattern text :=
    'p_seed,[[:space:]]+1,[[:space:]]+1,'
    || '[[:space:]]+1,[[:space:]]+1,'
    || '[[:space:]]+1,[[:space:]]+''active''';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_start_session_atomic('
      || 'uuid,uuid,text,bigint,integer,integer,integer,integer,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V2_START_RPC_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(v_oid);

  /*
   * Fail closed unless this is the ledger-upgraded production
   * authority we expect to transform.
   */
  if position(
    'game_play_transactions'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_START_LEDGER_AUTHORITY_MISSING';
  end if;

  if position(
    'analytics_events'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_START_ANALYTICS_PROJECTION_MISSING';
  end if;

  if position(
    'v_balance_before'
    in v_definition
  ) = 0
  or position(
    'v_balance_after'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_START_BALANCE_INVARIANT_MISSING';
  end if;

  if position(
    'for update'
    in lower(v_definition)
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_START_PLAYER_LOCK_MISSING';
  end if;

  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    v_guard_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_V2_START_VERSION_GUARD_OCCURRENCE_INVALID';
  end if;

  v_before := v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_guard_pattern,
      $replacement$
if not (
    (
      p_engine_version = 1
      and p_rules_version = 1
      and p_score_version = 1
      and p_replay_version = 1
    )
    or
    (
      p_engine_version = 2
      and p_rules_version = 2
      and p_score_version = 2
      and p_replay_version = 2
    )
  )
  then
$replacement$,
      'i'
    );

  if v_definition = v_before then
    raise exception
      'BLOCK_PUZZLE_V2_START_VERSION_GUARD_PATCH_FAILED';
  end if;

  /*
   * The previous function validated p_* versions but then wrote
   * literal 1/1/1/1 into the session row.
   *
   * V2 capability requires preserving the validated authority
   * tuple in the durable session.
   */
  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    v_insert_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_V2_START_VERSION_INSERT_OCCURRENCE_INVALID';
  end if;

  v_before := v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_insert_pattern,
      $replacement$
p_seed,
    p_engine_version,
    p_rules_version,
    p_score_version,
    p_replay_version,
    1,
    'active'
$replacement$,
      'i'
    );

  if v_definition = v_before then
    raise exception
      'BLOCK_PUZZLE_V2_START_VERSION_INSERT_PATCH_FAILED';
  end if;

  execute v_definition;
end;
$migration$;


/* ----------------------------------------------------------
 * 3. Upgrade the LATEST effective submit RPC in place.
 *
 * Preserve:
 * - ownership/session lock
 * - replay conflict hardening (P0001)
 * - verified score atomicity
 * - session terminal transition
 * ---------------------------------------------------------- */

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_before text;
  v_count integer;

  v_guard_pattern text :=
    'if[[:space:]]+v_session\.engine_version <> 1'
    || '[[:space:]]+or v_session\.rules_version <> 1'
    || '[[:space:]]+or v_session\.score_version <> 1'
    || '[[:space:]]+or v_session\.replay_version <> 1'
    || '[[:space:]]+then';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_submit_session_atomic('
      || 'uuid,text,integer,text,integer,integer,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_RPC_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(v_oid);

  if position(
    'BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_CONFLICT_BRANCH_MISSING';
  end if;

  /*
   * Conflict SQLSTATE was previously hardened from 40001 to
   * P0001. Refuse to continue if production is not on that
   * checkpoint.
   */
  if position(
    'using errcode = ''P0001'';'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_CONFLICT_HARDENING_MISSING';
  end if;

  if position(
    'block_puzzle_session_id'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_SCORE_BINDING_MISSING';
  end if;

  if position(
    'for update'
    in lower(v_definition)
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_SESSION_LOCK_MISSING';
  end if;

  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    v_guard_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_VERSION_GUARD_OCCURRENCE_INVALID';
  end if;

  v_before := v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_guard_pattern,
      $replacement$
if not (
    (
      v_session.engine_version = 1
      and v_session.rules_version = 1
      and v_session.score_version = 1
      and v_session.replay_version = 1
    )
    or
    (
      v_session.engine_version = 2
      and v_session.rules_version = 2
      and v_session.score_version = 2
      and v_session.replay_version = 2
    )
  )
  then
$replacement$,
      'i'
    );

  if v_definition = v_before then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_VERSION_GUARD_PATCH_FAILED';
  end if;

  /*
   * Keep V1 metadata exactly compatible, while making V2
   * metadata truthful instead of incorrectly labelling it V1.
   */
  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    '''server_replay_v1''',
    'g'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_AUTHORITY_METADATA_OCCURRENCE_INVALID';
  end if;

  v_definition :=
    replace(
      v_definition,
      '''server_replay_v1''',
      'format(''server_replay_v%s'', v_session.replay_version)'
    );

  execute v_definition;
end;
$migration$;


/* ----------------------------------------------------------
 * 4. Explicitly preserve backend-only execution authority.
 * ---------------------------------------------------------- */

revoke all
on function
public.cing_block_puzzle_start_session_atomic(
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
from public;

revoke all
on function
public.cing_block_puzzle_start_session_atomic(
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
from anon;

revoke all
on function
public.cing_block_puzzle_start_session_atomic(
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
from authenticated;

grant execute
on function
public.cing_block_puzzle_start_session_atomic(
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


revoke all
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
from public;

revoke all
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
from anon;

revoke all
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
from authenticated;

grant execute
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
to service_role;


/* ----------------------------------------------------------
 * 5. Post-transform source assertions.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_start text;
  v_submit text;
begin
  v_start :=
    pg_get_functiondef(
      to_regprocedure(
        'public.cing_block_puzzle_start_session_atomic('
        || 'uuid,uuid,text,bigint,integer,integer,integer,integer,integer)'
      )
    );

  v_submit :=
    pg_get_functiondef(
      to_regprocedure(
        'public.cing_block_puzzle_submit_session_atomic('
        || 'uuid,text,integer,text,integer,integer,integer)'
      )
    );

  if position(
    'p_engine_version = 2'
    in v_start
  ) = 0
  or position(
    'p_replay_version = 2'
    in v_start
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_START_POSTCHECK_FAILED';
  end if;

  if position(
    'game_play_transactions'
    in v_start
  ) = 0
  or position(
    'analytics_events'
    in v_start
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_START_LEDGER_POSTCHECK_FAILED';
  end if;

  if position(
    'v_session.engine_version = 2'
    in v_submit
  ) = 0
  or position(
    'v_session.replay_version = 2'
    in v_submit
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_POSTCHECK_FAILED';
  end if;

  if position(
    'using errcode = ''P0001'';'
    in v_submit
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_CONFLICT_POSTCHECK_FAILED';
  end if;

  if position(
    'server_replay_v%s'
    in v_submit
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V2_SUBMIT_METADATA_POSTCHECK_FAILED';
  end if;
end;
$migration$;

commit;
