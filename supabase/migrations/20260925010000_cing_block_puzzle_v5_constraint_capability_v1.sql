begin;

/*
 * CING GAME CENTER V2 — BLOCK PUZZLE V5
 * CONSTRAINT CAPABILITY V1
 *
 * Adds deterministic tuple:
 *
 *   V5: 4 / 4 / 3 / 5
 *
 * Preserves historical tuples:
 *
 *   V1: 1 / 1 / 1 / 1
 *   V2: 2 / 2 / 2 / 2
 *   V3: 2 / 2 / 2 / 3
 *   V4: 3 / 3 / 3 / 4
 *
 * Continue limits:
 *
 *   V1–V4: 0..3
 *   V5:    0..5
 *
 * CAPABILITY ONLY.
 *
 * Does not:
 * - change session issuance
 * - replace start/submit/continue RPCs
 * - purchase Continue
 * - debit loyalty points
 * - debit Revive Credit
 * - alter Wallet
 * - migrate existing sessions
 */

/* ----------------------------------------------------------
 * 1. FAIL-CLOSED PRECONDITIONS
 * ---------------------------------------------------------- */

do $migration$
declare
  v_versions text;
  v_continue text;

  v_versions_valid boolean;
  v_continue_valid boolean;
begin

  select
    pg_get_constraintdef(c.oid),
    c.convalidated
  into
    v_versions,
    v_versions_valid
  from pg_constraint c
  where c.conrelid =
    'public.cing_block_puzzle_sessions'::regclass
    and c.conname =
      'cing_block_puzzle_sessions_versions_ck'
    and c.contype = 'c';

  if v_versions is null
     or v_versions_valid is distinct from true
  then
    raise exception
      'BLOCK_PUZZLE_V5_VERSIONS_BASE_MISSING';
  end if;

  select
    pg_get_constraintdef(c.oid),
    c.convalidated
  into
    v_continue,
    v_continue_valid
  from pg_constraint c
  where c.conrelid =
    'public.cing_block_puzzle_sessions'::regclass
    and c.conname =
      'cing_block_puzzle_sessions_continue_count_ck'
    and c.contype = 'c';

  if v_continue is null
     or v_continue_valid is distinct from true
  then
    raise exception
      'BLOCK_PUZZLE_V5_CONTINUE_BASE_MISSING';
  end if;

  /*
   * Require all four historical version capabilities.
   * Reject an already-expanded or unexpected version base.
   */

  if position(
       'engine_version = 1' in v_versions
     ) = 0
     or position(
       'rules_version = 1' in v_versions
     ) = 0
     or position(
       'score_version = 1' in v_versions
     ) = 0
     or position(
       'replay_version = 1' in v_versions
     ) = 0
     or position(
       'engine_version = 2' in v_versions
     ) = 0
     or position(
       'rules_version = 2' in v_versions
     ) = 0
     or position(
       'score_version = 2' in v_versions
     ) = 0
     or position(
       'replay_version = 2' in v_versions
     ) = 0
     or position(
       'replay_version = 3' in v_versions
     ) = 0
     or position(
       'engine_version = 3' in v_versions
     ) = 0
     or position(
       'rules_version = 3' in v_versions
     ) = 0
     or position(
       'score_version = 3' in v_versions
     ) = 0
     or position(
       'replay_version = 4' in v_versions
     ) = 0
     or position(
       'engine_version = 4' in v_versions
     ) > 0
     or position(
       'replay_version = 5' in v_versions
     ) > 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_VERSIONS_BASE_MISMATCH';
  end if;

  if position(
       'continue_count >= 0' in v_continue
     ) = 0
     or position(
       'continue_count <= 3' in v_continue
     ) = 0
     or position(
       'continue_count <= 5' in v_continue
     ) > 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_CONTINUE_BASE_MISMATCH';
  end if;

end;
$migration$;

/* ----------------------------------------------------------
 * 2. EXPAND DETERMINISTIC SESSION VERSION CAPABILITY
 * ---------------------------------------------------------- */

alter table
  public.cing_block_puzzle_sessions
add constraint
  cing_block_puzzle_sessions_versions_v5_capability_ck
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
  or
  (
    engine_version = 4
    and rules_version = 4
    and score_version = 3
    and replay_version = 5
  )
)
not valid;

alter table
  public.cing_block_puzzle_sessions
validate constraint
  cing_block_puzzle_sessions_versions_v5_capability_ck;

alter table
  public.cing_block_puzzle_sessions
drop constraint
  cing_block_puzzle_sessions_versions_ck;

alter table
  public.cing_block_puzzle_sessions
rename constraint
  cing_block_puzzle_sessions_versions_v5_capability_ck
to
  cing_block_puzzle_sessions_versions_ck;

/* ----------------------------------------------------------
 * 3. EXPAND CONTINUE COUNT ONLY FOR V5
 * ---------------------------------------------------------- */

alter table
  public.cing_block_puzzle_sessions
add constraint
  cing_block_puzzle_sessions_continue_count_v5_capability_ck
check (
  (
    continue_count >= 0
    and continue_count <= 3
  )
  or
  (
    engine_version = 4
    and rules_version = 4
    and score_version = 3
    and replay_version = 5
    and continue_count >= 0
    and continue_count <= 5
  )
)
not valid;

alter table
  public.cing_block_puzzle_sessions
validate constraint
  cing_block_puzzle_sessions_continue_count_v5_capability_ck;

alter table
  public.cing_block_puzzle_sessions
drop constraint
  cing_block_puzzle_sessions_continue_count_ck;

alter table
  public.cing_block_puzzle_sessions
rename constraint
  cing_block_puzzle_sessions_continue_count_v5_capability_ck
to
  cing_block_puzzle_sessions_continue_count_ck;

/* ----------------------------------------------------------
 * 4. POST-TRANSFORM STRUCTURAL ASSERTIONS
 * ---------------------------------------------------------- */

do $migration$
declare
  v_versions text;
  v_continue text;
begin

  select pg_get_constraintdef(c.oid)
  into v_versions
  from pg_constraint c
  where c.conrelid =
    'public.cing_block_puzzle_sessions'::regclass
    and c.conname =
      'cing_block_puzzle_sessions_versions_ck';

  select pg_get_constraintdef(c.oid)
  into v_continue
  from pg_constraint c
  where c.conrelid =
    'public.cing_block_puzzle_sessions'::regclass
    and c.conname =
      'cing_block_puzzle_sessions_continue_count_ck';

  if v_versions is null
     or position(
       'engine_version = 4' in v_versions
     ) = 0
     or position(
       'rules_version = 4' in v_versions
     ) = 0
     or position(
       'score_version = 3' in v_versions
     ) = 0
     or position(
       'replay_version = 5' in v_versions
     ) = 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_VERSIONS_POSTCHECK_FAILED';
  end if;

  if v_continue is null
     or position(
       'continue_count <= 3' in v_continue
     ) = 0
     or position(
       'continue_count <= 5' in v_continue
     ) = 0
     or position(
       'engine_version = 4' in v_continue
     ) = 0
     or position(
       'replay_version = 5' in v_continue
     ) = 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_CONTINUE_POSTCHECK_FAILED';
  end if;

end;
$migration$;

commit;
