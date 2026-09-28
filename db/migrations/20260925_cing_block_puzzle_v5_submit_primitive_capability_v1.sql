begin;

/*
 * CING GAME CENTER V2 — BLOCK PUZZLE V5 SUBMIT PRIMITIVE CAPABILITY V1
 * Depends on V5 constraint capability and V5 8-argument submit capability.
 * Transforms ONLY the effective installed 7-argument score-submit primitive.
 * V1–V4 tuples, scoring, row locks, idempotency and permissions are preserved.
 * No data conversion, wallet/loyalty mutation or production activation.
 */
do $migration$
declare
  v_oid oid;
  v_wrapper_oid oid;
  v_definition text;
  v_original text;
  v_v4 text;
  v_v4_matches integer;
  v_constraint text;
  v_acl aclitem[];
  v_owner oid;
  v_v4_pattern text :=
      '[(][[:space:]]*v_session[.]engine_version[[:space:]]*=[[:space:]]*3'
   || '[[:space:]]+and[[:space:]]+v_session[.]rules_version[[:space:]]*=[[:space:]]*3'
   || '[[:space:]]+and[[:space:]]+v_session[.]score_version[[:space:]]*=[[:space:]]*3'
   || '[[:space:]]+and[[:space:]]+v_session[.]replay_version[[:space:]]*=[[:space:]]*4'
   || '[[:space:]]*[)]';
  v_v5 text :=
      E'\n    or\n    (\n'
   || E'      v_session.engine_version = 4\n'
   || E'      and v_session.rules_version = 4\n'
   || E'      and v_session.score_version = 3\n'
   || E'      and v_session.replay_version = 5\n'
   || E'    )';
begin
  select pg_get_constraintdef(c.oid)
    into v_constraint
  from pg_constraint c
  where c.conrelid = 'public.cing_block_puzzle_sessions'::regclass
    and c.conname = 'cing_block_puzzle_sessions_versions_ck'
    and c.contype = 'c'
    and c.convalidated = true;

  if v_constraint is null
     or position('engine_version = 4' in v_constraint) = 0
     or position('rules_version = 4' in v_constraint) = 0
     or position('score_version = 3' in v_constraint) = 0
     or position('replay_version = 5' in v_constraint) = 0
  then
    raise exception 'BLOCK_PUZZLE_V5_PRIMITIVE_CONSTRAINT_NOT_READY';
  end if;

  v_wrapper_oid := to_regprocedure(
    'public.cing_block_puzzle_submit_session_atomic_v2('
    || 'uuid,text,integer,text,integer,integer,integer,integer)'
  );
  if v_wrapper_oid is null
     or position('p_continues_used > 5'
          in lower(pg_get_functiondef(v_wrapper_oid))) = 0
     or position('v_session.replay_version not in (3, 4, 5)'
          in lower(pg_get_functiondef(v_wrapper_oid))) = 0
  then
    raise exception 'BLOCK_PUZZLE_V5_PRIMITIVE_WRAPPER_NOT_READY';
  end if;

  v_oid := to_regprocedure(
    'public.cing_block_puzzle_submit_session_atomic('
    || 'uuid,text,integer,text,integer,integer,integer)'
  );
  if v_oid is null then
    raise exception 'BLOCK_PUZZLE_V5_PRIMITIVE_NOT_FOUND';
  end if;

  select p.proacl, p.proowner
    into v_acl, v_owner
  from pg_proc p where p.oid = v_oid;

  v_definition := pg_get_functiondef(v_oid);
  v_original := v_definition;

  if v_definition is null
     or position('BLOCK_PUZZLE_SESSION_VERSION_INVALID' in v_definition) = 0
     or position('BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT' in v_definition) = 0
     or position('game_scores' in v_definition) = 0
     or position('block_puzzle_session_id' in v_definition) = 0
     or position('for update' in lower(v_definition)) = 0
     or position('security definer' in lower(v_definition)) = 0
     or position('replay_version = 5' in v_definition) > 0
  then
    raise exception 'BLOCK_PUZZLE_V5_PRIMITIVE_BASE_MISMATCH';
  end if;

  select count(*), min(m.match[1])
    into v_v4_matches, v_v4
  from regexp_matches(v_definition, v_v4_pattern, 'gi') as m(match);

  if v_v4_matches <> 1 or v_v4 is null
     or position(v_v4 in v_definition)
        > position('BLOCK_PUZZLE_SESSION_VERSION_INVALID' in v_definition)
  then
    raise exception 'BLOCK_PUZZLE_V5_PRIMITIVE_V4_ANCHOR_MISMATCH';
  end if;

  v_definition := replace(v_definition, v_v4, v_v4 || v_v5);

  if v_definition = v_original
     or position('v_session.engine_version = 4' in v_definition) = 0
     or position('v_session.rules_version = 4' in v_definition) = 0
     or position('v_session.score_version = 3' in v_definition) = 0
     or position('v_session.replay_version = 5' in v_definition) = 0
  then
    raise exception 'BLOCK_PUZZLE_V5_PRIMITIVE_TRANSFORM_FAILED';
  end if;

  execute v_definition;

  if pg_get_functiondef(v_oid) is null
     or position('v_session.replay_version = 5'
          in pg_get_functiondef(v_oid)) = 0
     or position('BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT'
          in pg_get_functiondef(v_oid)) = 0
     or position('game_scores' in pg_get_functiondef(v_oid)) = 0
     or exists (
       select 1 from pg_proc p
       where p.oid = v_oid
         and (p.proacl is distinct from v_acl
           or p.proowner is distinct from v_owner)
     )
  then
    raise exception 'BLOCK_PUZZLE_V5_PRIMITIVE_POSTCHECK_FAILED';
  end if;
end;
$migration$;

commit;
