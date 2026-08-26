begin;

/* ==========================================================
 * CING BLOCK PUZZLE
 * CONTINUE V4 BOOLEAN PREDICATE FIX
 *
 * Corrects the already-deployed malformed predicate:
 *
 *   if not (V3) or (V4) then
 *
 * into:
 *
 *   if not ((V3) or (V4)) then
 *
 * No authority body is reconstructed.
 * The latest production RPC is transformed in place.
 * ========================================================== */

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_before text;
  v_count integer;

  v_pattern text :=
    'if[[:space:]]+not[[:space:]]*'
    || '\([[:space:]]*'
    || 'v_session\.engine_version = 2[[:space:]]+'
    || 'and v_session\.rules_version = 2[[:space:]]+'
    || 'and v_session\.score_version = 2[[:space:]]+'
    || 'and v_session\.replay_version = 3[[:space:]]*'
    || '\)[[:space:]]*'
    || 'or[[:space:]]*'
    || '\([[:space:]]*'
    || 'v_session\.engine_version = 3[[:space:]]+'
    || 'and v_session\.rules_version = 3[[:space:]]+'
    || 'and v_session\.score_version = 3[[:space:]]+'
    || 'and v_session\.replay_version = 4[[:space:]]*'
    || '\)[[:space:]]*'
    || 'then';
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_purchase_continue_atomic('
      || 'uuid,uuid,uuid,text,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_V4_FIX_RPC_NOT_FOUND';
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
      'BLOCK_PUZZLE_CONTINUE_V4_FIX_EXPECTED_AUTHORITY_MISSING';
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
      'BLOCK_PUZZLE_CONTINUE_V4_FIX_MALFORMED_PREDICATE_COUNT_INVALID';
  end if;

  v_before :=
    v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_pattern,
      $replacement$
if not (
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
  ) then
$replacement$,
      'i'
    );

  if v_definition =
    v_before then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_V4_FIX_TRANSFORM_FAILED';
  end if;

  execute v_definition;
end;
$migration$;


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


/* ----------------------------------------------------------
 * Post-transform structural assertions.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_definition text;
  v_correct_pattern text;
  v_bad_pattern text;
  v_correct_count integer;
  v_bad_count integer;
begin
  v_definition :=
    pg_get_functiondef(
      to_regprocedure(
        'public.cing_block_puzzle_purchase_continue_atomic('
        || 'uuid,uuid,uuid,text,integer)'
      )
    );

  v_correct_pattern :=
    'if[[:space:]]+not[[:space:]]*'
    || '\([[:space:]]*'
    || '\([[:space:]]*'
    || 'v_session\.engine_version = 2[[:space:]]+'
    || 'and v_session\.rules_version = 2[[:space:]]+'
    || 'and v_session\.score_version = 2[[:space:]]+'
    || 'and v_session\.replay_version = 3[[:space:]]*'
    || '\)[[:space:]]*'
    || 'or[[:space:]]*'
    || '\([[:space:]]*'
    || 'v_session\.engine_version = 3[[:space:]]+'
    || 'and v_session\.rules_version = 3[[:space:]]+'
    || 'and v_session\.score_version = 3[[:space:]]+'
    || 'and v_session\.replay_version = 4[[:space:]]*'
    || '\)[[:space:]]*'
    || '\)[[:space:]]*'
    || 'then';

  v_bad_pattern :=
    'if[[:space:]]+not[[:space:]]*'
    || '\([[:space:]]*'
    || 'v_session\.engine_version = 2[[:space:]]+'
    || 'and v_session\.rules_version = 2[[:space:]]+'
    || 'and v_session\.score_version = 2[[:space:]]+'
    || 'and v_session\.replay_version = 3[[:space:]]*'
    || '\)[[:space:]]*'
    || 'or[[:space:]]*'
    || '\([[:space:]]*'
    || 'v_session\.engine_version = 3';

  select count(*)
  into v_correct_count
  from regexp_matches(
    v_definition,
    v_correct_pattern,
    'gi'
  );

  select count(*)
  into v_bad_count
  from regexp_matches(
    v_definition,
    v_bad_pattern,
    'gi'
  );

  if v_correct_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_V4_FIX_GROUPING_POSTCHECK_FAILED';
  end if;

  if v_bad_count <> 0 then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_V4_FIX_BAD_PRECEDENCE_STILL_PRESENT';
  end if;

  if position(
    'point_transactions'
    in v_definition
  ) = 0
  or position(
    'analytics_events'
    in v_definition
  ) = 0
  or position(
    'cing_block_puzzle_continue_purchases'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_V4_FIX_LEDGER_AUTHORITY_LOST';
  end if;
end;
$migration$;

commit;
