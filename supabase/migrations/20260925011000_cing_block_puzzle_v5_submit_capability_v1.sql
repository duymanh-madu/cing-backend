begin;

/*
 * CING GAME CENTER V2
 * BLOCK PUZZLE V5 SUBMIT CAPABILITY V1
 *
 * Prerequisite:
 *   Block Puzzle V5 constraint capability.
 *
 * Transforms the EFFECTIVE installed 8-argument submit RPC.
 *
 * Preserves:
 *   - historical V1/V2/V3/V4 session compatibility
 *   - session FOR UPDATE serialization
 *   - authoritative continue_count comparison
 *   - legacy submit primitive
 *   - top1_check submit effects outbox
 *   - existing RPC identity and privileges
 *
 * Does NOT:
 *   - change session issuance
 *   - change Continue purchase RPC
 *   - debit loyalty points
 *   - debit Revive Credit
 *   - change Wallet
 *   - migrate historical sessions
 */

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_before text;

  v_limit_pattern text :=
    'p_continues_used[[:space:]]*>[[:space:]]*3';

  v_replay_pattern text :=
    'v_session[.]replay_version'
    || '[[:space:]]+not[[:space:]]+in'
    || '[[:space:]]*[(][[:space:]]*3'
    || '[[:space:]]*,[[:space:]]*4'
    || '[[:space:]]*[)]';

  v_count integer;
  v_constraint text;

begin

  /*
   * 1. Require the exact V5 session constraint capability.
   */

  select
    pg_get_constraintdef(c.oid)
  into v_constraint
  from pg_constraint c
  where c.conrelid =
    'public.cing_block_puzzle_sessions'::regclass
    and c.conname =
      'cing_block_puzzle_sessions_versions_ck'
    and c.contype = 'c'
    and c.convalidated = true;

  if v_constraint is null
    or position(
      'engine_version = 4'
      in v_constraint
    ) = 0
    or position(
      'rules_version = 4'
      in v_constraint
    ) = 0
    or position(
      'score_version = 3'
      in v_constraint
    ) = 0
    or position(
      'replay_version = 5'
      in v_constraint
    ) = 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_CONSTRAINT_NOT_READY';
  end if;

  /*
   * 2. Locate the effective 8-argument submit wrapper.
   */

  v_oid := to_regprocedure(
    'public.cing_block_puzzle_submit_session_atomic_v2('
    || 'uuid,text,integer,text,integer,integer,integer,integer)'
  );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_RPC_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(v_oid);

  if v_definition is null then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_DEFINITION_UNAVAILABLE';
  end if;

  /*
   * 3. Fail closed if previously installed authorities
   *    are missing from the effective function.
   */

  if position(
      'BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH'
      in v_definition
    ) = 0
    or position(
      'BLOCK_PUZZLE_CONTINUES_USED_INVALID'
      in v_definition
    ) = 0
    or position(
      'cing_block_puzzle_submit_session_atomic('
      in v_definition
    ) = 0
    or position(
      'cing_block_puzzle_submit_effects'
      in v_definition
    ) = 0
    or position(
      'for update'
      in lower(v_definition)
    ) = 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_BASE_AUTHORITY_MISMATCH';
  end if;

  /*
   * 4. Require exactly one historical max-3 input guard.
   */

  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    v_limit_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_LIMIT_ANCHOR_MISMATCH';
  end if;

  /*
   * 5. Require exactly one historical replay V3/V4 guard.
   */

  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    v_replay_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_REPLAY_ANCHOR_MISMATCH';
  end if;

  /*
   * 6. Preserve effective function body and mutate
   *    only the two verified predicates.
   */

  v_before := v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_limit_pattern,
      'p_continues_used > 5',
      'i'
    );

  v_definition :=
    regexp_replace(
      v_definition,
      v_replay_pattern,
      'v_session.replay_version not in (3, 4, 5)',
      'i'
    );

  if v_definition = v_before then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_TRANSFORM_FAILED';
  end if;

  /*
   * 7. Assert both replacement predicates.
   */

  if position(
      'p_continues_used > 5'
      in lower(v_definition)
    ) = 0
    or position(
      'v_session.replay_version not in (3, 4, 5)'
      in lower(v_definition)
    ) = 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_REPLACEMENT_MISMATCH';
  end if;

  /*
   * Historical sessions remain capped by:
   *
   *   - their version-aware CHECK constraint
   *   - the locked session.continue_count
   *   - p_continues_used = v_session.continue_count
   *
   * A V1–V4 session cannot acquire 4–5 continues.
   */

  /*
   * 8. Install only the transformed effective RPC.
   */

  execute v_definition;

  /*
   * 9. Verify the installed function itself.
   */

  v_definition :=
    pg_get_functiondef(v_oid);

  if v_definition is null
    or position(
      'p_continues_used > 5'
      in lower(v_definition)
    ) = 0
    or position(
      'v_session.replay_version not in (3, 4, 5)'
      in lower(v_definition)
    ) = 0
    or position(
      'BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH'
      in v_definition
    ) = 0
    or position(
      'cing_block_puzzle_submit_effects'
      in v_definition
    ) = 0
    or position(
      'for update'
      in lower(v_definition)
    ) = 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_SUBMIT_POSTCHECK_FAILED';
  end if;

end;
$migration$;

commit;
