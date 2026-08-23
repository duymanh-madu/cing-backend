begin;

/* ==========================================================
 * CING BLOCK PUZZLE — REPLAY V3 CAPABILITY
 *
 * Supported deterministic tuples after this migration:
 *
 * V1:
 *   1 / 1 / 1 / 1
 *
 * V2:
 *   2 / 2 / 2 / 2
 *
 * V3 replay:
 *   2 / 2 / 2 / 3
 *
 * This migration DOES NOT activate V3 issuance.
 * ========================================================== */


/* ----------------------------------------------------------
 * 1. Session table capability.
 * ---------------------------------------------------------- */

alter table
  public.cing_block_puzzle_sessions
add constraint
  cing_block_puzzle_sessions_versions_v3_capability_ck
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
  or
  (
    engine_version = 2
    and rules_version = 2
    and score_version = 2
    and replay_version = 3
  )
)
not valid;

alter table
  public.cing_block_puzzle_sessions
validate constraint
  cing_block_puzzle_sessions_versions_v3_capability_ck;

alter table
  public.cing_block_puzzle_sessions
drop constraint
  cing_block_puzzle_sessions_versions_ck;

alter table
  public.cing_block_puzzle_sessions
rename constraint
  cing_block_puzzle_sessions_versions_v3_capability_ck
to
  cing_block_puzzle_sessions_versions_ck;


/* ----------------------------------------------------------
 * 2. Upgrade latest effective START RPC in place.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_before text;
  v_count integer;

  v_pattern text :=
    '\([[:space:]]*'
    || 'p_engine_version = 2[[:space:]]+'
    || 'and p_rules_version = 2[[:space:]]+'
    || 'and p_score_version = 2[[:space:]]+'
    || 'and p_replay_version = 2[[:space:]]*'
    || '\)';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_start_session_atomic('
      || 'uuid,uuid,text,bigint,integer,integer,integer,integer,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V3_START_RPC_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(v_oid);

  if position(
    'game_play_transactions'
    in v_definition
  ) = 0
  or position(
    'analytics_events'
    in v_definition
  ) = 0
  or position(
    'for update'
    in lower(v_definition)
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V3_START_EXPECTED_AUTHORITY_MISSING';
  end if;

  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    v_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_V3_START_V2_BRANCH_OCCURRENCE_INVALID';
  end if;

  if position(
    'p_replay_version = 3'
    in v_definition
  ) > 0 then
    raise exception
      'BLOCK_PUZZLE_V3_START_ALREADY_PATCHED_UNEXPECTEDLY';
  end if;

  v_before :=
    v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_pattern,
      $replacement$
(
      p_engine_version = 2
      and p_rules_version = 2
      and p_score_version = 2
      and p_replay_version = 2
    )
    or
    (
      p_engine_version = 2
      and p_rules_version = 2
      and p_score_version = 2
      and p_replay_version = 3
    )
$replacement$,
      'i'
    );

  if v_definition =
    v_before then
    raise exception
      'BLOCK_PUZZLE_V3_START_PATCH_FAILED';
  end if;

  execute v_definition;
end;
$migration$;


/* ----------------------------------------------------------
 * 3. Upgrade latest effective SUBMIT RPC in place.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_before text;
  v_count integer;

  v_pattern text :=
    '\([[:space:]]*'
    || 'v_session\.engine_version = 2[[:space:]]+'
    || 'and v_session\.rules_version = 2[[:space:]]+'
    || 'and v_session\.score_version = 2[[:space:]]+'
    || 'and v_session\.replay_version = 2[[:space:]]*'
    || '\)';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_submit_session_atomic('
      || 'uuid,text,integer,text,integer,integer,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V3_SUBMIT_RPC_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(v_oid);

  if position(
    'BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT'
    in v_definition
  ) = 0
  or position(
    'using errcode = ''P0001'';'
    in v_definition
  ) = 0
  or position(
    'block_puzzle_session_id'
    in v_definition
  ) = 0
  or position(
    'for update'
    in lower(v_definition)
  ) = 0
  or position(
    'server_replay_v%s'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V3_SUBMIT_EXPECTED_AUTHORITY_MISSING';
  end if;

  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    v_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_V3_SUBMIT_V2_BRANCH_OCCURRENCE_INVALID';
  end if;

  if position(
    'v_session.replay_version = 3'
    in v_definition
  ) > 0 then
    raise exception
      'BLOCK_PUZZLE_V3_SUBMIT_ALREADY_PATCHED_UNEXPECTEDLY';
  end if;

  v_before :=
    v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_pattern,
      $replacement$
(
      v_session.engine_version = 2
      and v_session.rules_version = 2
      and v_session.score_version = 2
      and v_session.replay_version = 2
    )
    or
    (
      v_session.engine_version = 2
      and v_session.rules_version = 2
      and v_session.score_version = 2
      and v_session.replay_version = 3
    )
$replacement$,
      'i'
    );

  if v_definition =
    v_before then
    raise exception
      'BLOCK_PUZZLE_V3_SUBMIT_PATCH_FAILED';
  end if;

  execute v_definition;
end;
$migration$;


/* ----------------------------------------------------------
 * 4. Preserve backend-only RPC ACL.
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
from public, anon, authenticated;

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
from public, anon, authenticated;

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
 * 5. Post-transform assertions.
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
    'p_replay_version = 2'
    in v_start
  ) = 0
  or position(
    'p_replay_version = 3'
    in v_start
  ) = 0
  or position(
    'game_play_transactions'
    in v_start
  ) = 0
  or position(
    'analytics_events'
    in v_start
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V3_START_POSTCHECK_FAILED';
  end if;

  if position(
    'v_session.replay_version = 2'
    in v_submit
  ) = 0
  or position(
    'v_session.replay_version = 3'
    in v_submit
  ) = 0
  or position(
    'using errcode = ''P0001'';'
    in v_submit
  ) = 0
  or position(
    'server_replay_v%s'
    in v_submit
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V3_SUBMIT_POSTCHECK_FAILED';
  end if;
end;
$migration$;

commit;
