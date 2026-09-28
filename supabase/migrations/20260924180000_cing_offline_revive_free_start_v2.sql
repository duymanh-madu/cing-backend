/*
 * CING GAME CENTER V2 — FREE START V2
 *
 * Additive migration after paid_start_v1.
 *
 * Supersedes paid session admission for:
 *   cing-stack-tower
 *   black-pearl-rush
 *
 * Block Puzzle retains its independent PostgreSQL
 * session and replay authority.
 *
 * Preserve the original start RPC's signature,
 * return contract, request replay and security grants.
 *
 * No game_plays, Revive Credit, Wallet or loyalty debit.
 */

begin;

/*
 * CING GAME CENTER V2
 * FREE OFFLINE REVIVAL SESSION START V1
 *
 * Applies only to:
 * - cing-stack-tower
 * - black-pearl-rush
 *
 * Backend must authenticate the caller and bind
 * p_user_id to the authenticated account.
 *
 * No game-play debit, revive-credit debit,
 * Wallet debit, loyalty mutation or score submit.
 */

create or replace function public.cing_offline_revive_start_v1(
  p_user_id text,
  p_request_id uuid,
  p_game_key text
)
returns table (
  applied boolean,
  session_id uuid,
  game_key text,
  session_status text,
  revives_used integer,
  event_seq integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_game_key text;
  v_existing
    public.cing_offline_revive_sessions%rowtype;
  v_created
    public.cing_offline_revive_sessions%rowtype;
begin

  v_user_id :=
    nullif(btrim(coalesce(p_user_id, '')), '');

  v_game_key :=
    nullif(btrim(coalesce(p_game_key, '')), '');

  if v_user_id is null then
    raise exception 'REVIVAL_USER_REQUIRED'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'REVIVAL_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if v_game_key is null
     or v_game_key not in (
       'cing-stack-tower',
       'black-pearl-rush'
     )
  then
    raise exception 'REVIVAL_GAME_NOT_SUPPORTED'
      using errcode = '22023';
  end if;

  /*
   * A caller-provided user_id is never sufficient
   * authentication. The backend route must bind
   * this value to its verified account identity.
   */

  perform 1
  from public.players p
  where p.user_id = v_user_id;

  if not found then
    raise exception 'REVIVAL_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Exact request replay returns the original
   * session, including its current lifecycle.
   */

  select *
    into v_existing
  from public.cing_offline_revive_sessions s
  where s.user_id = v_user_id
    and s.request_id = p_request_id;

  if found then

    if v_existing.game_key <> v_game_key then
      raise exception 'REVIVAL_START_REFERENCE_CONFLICT'
        using errcode = '23505';
    end if;

    return query
    select
      false,
      v_existing.id,
      v_existing.game_key,
      v_existing.status,
      v_existing.revives_used,
      v_existing.event_seq,
      v_existing.expires_at;

    return;
  end if;

  /*
   * Uniqueness serializes concurrent starts
   * with the same user_id + request_id.
   *
   * The database owns session_id and expiry.
   */

  insert into public.cing_offline_revive_sessions (
    id,
    request_id,
    user_id,
    game_key,
    status,
    revives_used,
    event_seq,
    expires_at
  )
  values (
    gen_random_uuid(),
    p_request_id,
    v_user_id,
    v_game_key,
    'active',
    0,
    0,
    now() + interval '4 hours'
  )
  on conflict (user_id, request_id)
    do nothing
  returning *
    into v_created;

  if found then

    return query
    select
      true,
      v_created.id,
      v_created.game_key,
      v_created.status,
      v_created.revives_used,
      v_created.event_seq,
      v_created.expires_at;

    return;
  end if;

  /*
   * A concurrent transaction already inserted
   * the same business request.
   */

  select *
    into v_existing
  from public.cing_offline_revive_sessions s
  where s.user_id = v_user_id
    and s.request_id = p_request_id;

  if not found then
    raise exception 'REVIVAL_START_REPLAY_NOT_FOUND'
      using errcode = '55000';
  end if;

  if v_existing.game_key <> v_game_key then
    raise exception 'REVIVAL_START_REFERENCE_CONFLICT'
      using errcode = '23505';
  end if;

  return query
  select
    false,
    v_existing.id,
    v_existing.game_key,
    v_existing.status,
    v_existing.revives_used,
    v_existing.event_seq,
    v_existing.expires_at;

end;
$$;

/*
 * The backend connects with service_role.
 * Browser clients never receive EXECUTE.
 */

revoke all
on function public.cing_offline_revive_start_v1(
  text,
  uuid,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.cing_offline_revive_start_v1(
  text,
  uuid,
  text
)
to service_role;

commit;
