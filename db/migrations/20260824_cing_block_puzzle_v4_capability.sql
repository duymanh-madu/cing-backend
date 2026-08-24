begin;

/* ==========================================================
 * CING BLOCK PUZZLE — DETERMINISTIC V4 CAPABILITY
 *
 * Supported tuples after this migration:
 *
 * V1: 1 / 1 / 1 / 1
 * V2: 2 / 2 / 2 / 2
 * V3: 2 / 2 / 2 / 3
 * V4: 3 / 3 / 3 / 4
 *
 * This migration DOES NOT activate V4 issuance.
 * It transforms the latest effective production RPC bodies
 * instead of reconstructing stale definitions.
 * ========================================================== */


/* ----------------------------------------------------------
 * 1. Expand session-table deterministic capability.
 * ---------------------------------------------------------- */

alter table
  public.cing_block_puzzle_sessions
add constraint
  cing_block_puzzle_sessions_versions_v4_capability_ck
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
  or
  (
    engine_version = 3
    and rules_version = 3
    and score_version = 3
    and replay_version = 4
  )
)
not valid;

alter table
  public.cing_block_puzzle_sessions
validate constraint
  cing_block_puzzle_sessions_versions_v4_capability_ck;

alter table
  public.cing_block_puzzle_sessions
drop constraint
  cing_block_puzzle_sessions_versions_ck;

alter table
  public.cing_block_puzzle_sessions
rename constraint
  cing_block_puzzle_sessions_versions_v4_capability_ck
to
  cing_block_puzzle_sessions_versions_ck;


/* ----------------------------------------------------------
 * 2. Expand latest effective START authority.
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
    || 'and p_replay_version = 3[[:space:]]*'
    || '\)';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_start_session_atomic('
      || 'uuid,uuid,text,bigint,integer,integer,integer,integer,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V4_START_RPC_NOT_FOUND';
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
      'BLOCK_PUZZLE_V4_START_EXPECTED_AUTHORITY_MISSING';
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
      'BLOCK_PUZZLE_V4_START_V3_BRANCH_OCCURRENCE_INVALID';
  end if;

  if position(
    'p_engine_version = 3'
    in v_definition
  ) > 0
  or position(
    'p_replay_version = 4'
    in v_definition
  ) > 0 then
    raise exception
      'BLOCK_PUZZLE_V4_START_ALREADY_PATCHED_UNEXPECTEDLY';
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
      and p_replay_version = 3
    )
    or
    (
      p_engine_version = 3
      and p_rules_version = 3
      and p_score_version = 3
      and p_replay_version = 4
    )
$replacement$,
      'i'
    );

  if v_definition =
    v_before then
    raise exception
      'BLOCK_PUZZLE_V4_START_PATCH_FAILED';
  end if;

  execute v_definition;
end;
$migration$;


/* ----------------------------------------------------------
 * 3. Expand latest effective legacy SUBMIT primitive.
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
    || 'and v_session\.replay_version = 3[[:space:]]*'
    || '\)';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_submit_session_atomic('
      || 'uuid,text,integer,text,integer,integer,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_RPC_NOT_FOUND';
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
      'BLOCK_PUZZLE_V4_SUBMIT_EXPECTED_AUTHORITY_MISSING';
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
      'BLOCK_PUZZLE_V4_SUBMIT_V3_BRANCH_OCCURRENCE_INVALID';
  end if;

  if position(
    'v_session.engine_version = 3'
    in v_definition
  ) > 0
  or position(
    'v_session.replay_version = 4'
    in v_definition
  ) > 0 then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_ALREADY_PATCHED_UNEXPECTEDLY';
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
      and v_session.replay_version = 3
    )
    or
    (
      v_session.engine_version = 3
      and v_session.rules_version = 3
      and v_session.score_version = 3
      and v_session.replay_version = 4
    )
$replacement$,
      'i'
    );

  if v_definition =
    v_before then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_PATCH_FAILED';
  end if;

  execute v_definition;
end;
$migration$;


/* ----------------------------------------------------------
 * 4. Expand latest effective CONTINUE purchase authority.
 *
 * Keep the existing public error code for compatibility.
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
    || 'and v_session\.replay_version = 3[[:space:]]*'
    || '\)';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_purchase_continue_atomic('
      || 'uuid,uuid,uuid,text,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V4_CONTINUE_RPC_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(v_oid);

  if position(
    'cing_block_puzzle_continue_purchases'
    in v_definition
  ) = 0
  or position(
    'point_transactions'
    in v_definition
  ) = 0
  or position(
    'analytics_events'
    in v_definition
  ) = 0
  or position(
    'for update'
    in lower(v_definition)
  ) = 0
  or position(
    'BLOCK_PUZZLE_CONTINUE_REQUIRES_REPLAY_V3'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V4_CONTINUE_EXPECTED_AUTHORITY_MISSING';
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
      'BLOCK_PUZZLE_V4_CONTINUE_V3_BRANCH_OCCURRENCE_INVALID';
  end if;

  if position(
    'v_session.engine_version = 3'
    in v_definition
  ) > 0
  or position(
    'v_session.replay_version = 4'
    in v_definition
  ) > 0 then
    raise exception
      'BLOCK_PUZZLE_V4_CONTINUE_ALREADY_PATCHED_UNEXPECTEDLY';
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
      and v_session.replay_version = 3
    )
    or
    (
      v_session.engine_version = 3
      and v_session.rules_version = 3
      and v_session.score_version = 3
      and v_session.replay_version = 4
    )
$replacement$,
      'i'
    );

  if v_definition =
    v_before then
    raise exception
      'BLOCK_PUZZLE_V4_CONTINUE_PATCH_FAILED';
  end if;

  execute v_definition;
end;
$migration$;


/* ----------------------------------------------------------
 * 5. Expand submit / purchased-continue wrapper.
 *
 * Replay V3 and Replay V4 both use chronological event
 * streams containing authoritative continue events.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_before text;
  v_count integer;

  v_pattern text :=
    'v_session\.replay_version <> 3'
    || '[[:space:]]+'
    || 'and p_continues_used <> 0';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_submit_session_atomic_v2('
      || 'uuid,text,integer,text,integer,integer,integer,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_WRAPPER_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(v_oid);

  if position(
    'continue_count'
    in v_definition
  ) = 0
  or position(
    'BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH'
    in v_definition
  ) = 0
  or position(
    'for update'
    in lower(v_definition)
  ) = 0
  or position(
    'cing_block_puzzle_submit_session_atomic('
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_WRAPPER_EXPECTED_AUTHORITY_MISSING';
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
      'BLOCK_PUZZLE_V4_SUBMIT_WRAPPER_V3_OCCURRENCE_INVALID';
  end if;

  if position(
    'replay_version not in (3, 4)'
    in lower(v_definition)
  ) > 0 then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_WRAPPER_ALREADY_PATCHED_UNEXPECTEDLY';
  end if;

  v_before :=
    v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_pattern,
      $replacement$
v_session.replay_version not in (3, 4)
    and p_continues_used <> 0
$replacement$,
      'i'
    );

  if v_definition =
    v_before then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_WRAPPER_PATCH_FAILED';
  end if;

  execute v_definition;
end;
$migration$;


/* ----------------------------------------------------------
 * 6. Preserve backend-only RPC ACL.
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


revoke all
on function
public.cing_block_puzzle_purchase_continue_atomic(
  uuid,
  uuid,
  uuid,
  text,
  integer
)
from public, anon, authenticated;

grant execute
on function
public.cing_block_puzzle_purchase_continue_atomic(
  uuid,
  uuid,
  uuid,
  text,
  integer
)
to service_role;


revoke all
on function
public.cing_block_puzzle_submit_session_atomic_v2(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer,
  integer
)
from public, anon, authenticated;

grant execute
on function
public.cing_block_puzzle_submit_session_atomic_v2(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer,
  integer
)
to service_role;


/* ----------------------------------------------------------
 * 7. Post-transform assertions.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_constraint text;
  v_start text;
  v_submit text;
  v_continue text;
  v_wrapper text;
begin
  select
    pg_get_constraintdef(c.oid)
  into v_constraint
  from pg_constraint c
  where c.conrelid =
    'public.cing_block_puzzle_sessions'::regclass
    and c.conname =
      'cing_block_puzzle_sessions_versions_ck';

  if v_constraint is null
  or position(
    'engine_version = 3'
    in v_constraint
  ) = 0
  or position(
    'rules_version = 3'
    in v_constraint
  ) = 0
  or position(
    'score_version = 3'
    in v_constraint
  ) = 0
  or position(
    'replay_version = 4'
    in v_constraint
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V4_CONSTRAINT_POSTCHECK_FAILED';
  end if;

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

  v_continue :=
    pg_get_functiondef(
      to_regprocedure(
        'public.cing_block_puzzle_purchase_continue_atomic('
        || 'uuid,uuid,uuid,text,integer)'
      )
    );

  v_wrapper :=
    pg_get_functiondef(
      to_regprocedure(
        'public.cing_block_puzzle_submit_session_atomic_v2('
        || 'uuid,text,integer,text,integer,integer,integer,integer)'
      )
    );

  if position(
    'p_engine_version = 3'
    in v_start
  ) = 0
  or position(
    'p_rules_version = 3'
    in v_start
  ) = 0
  or position(
    'p_score_version = 3'
    in v_start
  ) = 0
  or position(
    'p_replay_version = 4'
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
      'BLOCK_PUZZLE_V4_START_POSTCHECK_FAILED';
  end if;

  if position(
    'v_session.engine_version = 3'
    in v_submit
  ) = 0
  or position(
    'v_session.rules_version = 3'
    in v_submit
  ) = 0
  or position(
    'v_session.score_version = 3'
    in v_submit
  ) = 0
  or position(
    'v_session.replay_version = 4'
    in v_submit
  ) = 0
  or position(
    'server_replay_v%s'
    in v_submit
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_POSTCHECK_FAILED';
  end if;

  if position(
    'v_session.engine_version = 3'
    in v_continue
  ) = 0
  or position(
    'v_session.rules_version = 3'
    in v_continue
  ) = 0
  or position(
    'v_session.score_version = 3'
    in v_continue
  ) = 0
  or position(
    'v_session.replay_version = 4'
    in v_continue
  ) = 0
  or position(
    'point_transactions'
    in v_continue
  ) = 0
  or position(
    'analytics_events'
    in v_continue
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V4_CONTINUE_POSTCHECK_FAILED';
  end if;

  if position(
    'replay_version not in (3, 4)'
    in lower(v_wrapper)
  ) = 0
  or position(
    'BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH'
    in v_wrapper
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_V4_SUBMIT_WRAPPER_POSTCHECK_FAILED';
  end if;
end;
$migration$;

commit;
