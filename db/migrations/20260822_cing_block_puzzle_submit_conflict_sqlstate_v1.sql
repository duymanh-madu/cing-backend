begin;

do $$
declare
  v_oid oid;
  v_definition text;
  v_old text :=
    E'''BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT''
        using errcode = ''40001'';';
  v_new text :=
    E'''BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT''
        using errcode = ''P0001'';';
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname =
      'cing_block_puzzle_submit_session_atomic'
    and pg_get_function_identity_arguments(p.oid) =
      'p_session_id uuid, p_user_id text, p_verified_score integer, p_replay_fingerprint text, p_move_count integer, p_best_combo integer, p_total_lines_cleared integer';

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_RPC_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(v_oid);

  if position(
    'BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT'
    in v_definition
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_CONFLICT_BRANCH_NOT_FOUND';
  end if;

  if position(
    'using errcode = ''40001'';'
    in v_definition
  ) = 0 then
    /*
     * Idempotent success if already hardened.
     */
    if position(
      'using errcode = ''P0001'';'
      in v_definition
    ) > 0 then
      return;
    end if;

    raise exception
      'BLOCK_PUZZLE_CONFLICT_SQLSTATE_UNEXPECTED';
  end if;

  /*
   * There must be exactly one serialization-failure SQLSTATE
   * in this RPC. We never rewrite unrelated error branches.
   */
  if (
    length(v_definition)
    -
    length(
      replace(
        v_definition,
        'using errcode = ''40001'';',
        ''
      )
    )
  ) /
  length(
    'using errcode = ''40001'';'
  ) <> 1
  then
    raise exception
      'BLOCK_PUZZLE_40001_OCCURRENCE_INVALID';
  end if;

  v_definition :=
    replace(
      v_definition,
      'using errcode = ''40001'';',
      'using errcode = ''P0001'';'
    );

  execute v_definition;
end;
$$;

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

commit;
