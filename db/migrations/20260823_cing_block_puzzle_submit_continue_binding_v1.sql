begin;

-- ==========================================================
-- CING BLOCK PUZZLE
-- SUBMIT / PURCHASED-CONTINUE BINDING V1
--
-- Replay V3 continue events must exactly equal the number
-- of durable continue purchases committed for the session.
--
-- The new 8-arg RPC owns public backend submit authority.
-- The legacy 7-arg RPC remains an internal SECURITY DEFINER
-- primitive but service_role can no longer execute it.
-- ==========================================================

create or replace function
public.cing_block_puzzle_submit_session_atomic_v2(
  p_session_id uuid,
  p_user_id text,
  p_verified_score integer,
  p_replay_fingerprint text,
  p_move_count integer,
  p_best_combo integer,
  p_total_lines_cleared integer,
  p_continues_used integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session
    public.cing_block_puzzle_sessions%rowtype;

  v_result jsonb;
begin
  if p_session_id is null then
    raise exception
      'BLOCK_PUZZLE_SESSION_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if
    p_continues_used is null
    or p_continues_used < 0
    or p_continues_used > 3
  then
    raise exception
      'BLOCK_PUZZLE_CONTINUES_USED_INVALID'
      using errcode = '22023';
  end if;

  /*
   * This lock is intentionally acquired before calling the
   * legacy submit primitive. PostgreSQL retains it until the
   * outer transaction completes, closing submit/purchase TOCTOU.
   */
  select *
  into v_session
  from public.cing_block_puzzle_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception
      'BLOCK_PUZZLE_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_session.user_id <> p_user_id then
    raise exception
      'BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH'
      using errcode = '42501';
  end if;

  if
    p_continues_used <>
      v_session.continue_count
  then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_PURCHASE_MISMATCH'
      using errcode = 'P0001';
  end if;

  /*
   * Legacy replay V1/V2 sessions cannot contain continue events.
   * They remain valid only while continue_count = 0.
   */
  if
    v_session.replay_version <> 3
    and p_continues_used <> 0
  then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_REQUIRES_REPLAY_V3'
      using errcode = 'P0001';
  end if;

  select
    public.cing_block_puzzle_submit_session_atomic(
      p_session_id,
      p_user_id,
      p_verified_score,
      p_replay_fingerprint,
      p_move_count,
      p_best_combo,
      p_total_lines_cleared
    )
  into v_result;

  if
    v_result is null
    or jsonb_typeof(v_result) <> 'object'
  then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_WRAPPER_RESULT_INVALID'
      using errcode = '55000';
  end if;

  return
    v_result ||
    jsonb_build_object(
      'continues_used',
      p_continues_used
    );
end;
$function$;


-- ----------------------------------------------------------
-- Expand-phase compatibility.
--
-- The existing 7-arg backend submit RPC intentionally keeps
-- its current service_role EXECUTE privilege during rollout.
--
-- Production backend may still be running the previous build
-- while this migration is applied. Revoking service_role here
-- would create a deployment-order outage.
--
-- After the new backend is deployed and verified using the
-- v2 wrapper, a separate contract-phase migration will revoke
-- service_role from the legacy primitive.
--
-- Public client roles remain revoked by the existing authority
-- migrations and are not granted anything here.
-- ----------------------------------------------------------


-- ----------------------------------------------------------
-- New submit authority is backend-only.
-- ----------------------------------------------------------

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
from public;

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
from anon;

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
from authenticated;

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

commit;
