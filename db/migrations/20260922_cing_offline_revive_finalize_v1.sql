begin;

/*
 * CING GAME CENTER V2
 * ATOMIC OFFLINE REVIVAL FINALIZE V1
 *
 * Games:
 * - cing-stack-tower
 * - black-pearl-rush
 *
 * Precondition:
 *   session.status = revive_pending
 *
 * One transaction:
 *   score row
 *   + finalized event
 *   + finalized session
 *
 * No credit debit.
 * No Wallet or loyalty mutation.
 * No daily challenge award.
 *
 * NOTE:
 * Final score is client-reported gameplay data.
 * This RPC establishes lifecycle and persistence
 * authority, not deterministic score verification.
 */

alter table public.cing_offline_revive_sessions
  add column final_score integer,
  add column final_best_combo integer;

alter table public.cing_offline_revive_sessions
  add constraint
    cing_offline_revive_final_result_ck
  check (
    (
      status = 'finalized'
      and final_score between 0 and 1000000
      and final_best_combo between 0 and 1000000
    )
    or
    (
      status <> 'finalized'
      and final_score is null
      and final_best_combo is null
    )
  );

create function
  public.cing_offline_revive_finalize_v1(
    p_user_id text,
    p_session_id uuid,
    p_request_id uuid,
    p_expected_event_seq integer,
    p_final_score integer,
    p_final_best_combo integer,
    p_player_name text,
    p_avatar text
  )
returns table (
  applied boolean,
  session_id uuid,
  event_id bigint,
  event_seq integer,
  score_id bigint,
  final_score integer,
  final_best_combo integer,
  session_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_session public.cing_offline_revive_sessions%rowtype;
  v_existing public.cing_offline_revive_events%rowtype;
  v_score public.game_scores%rowtype;
  v_event_id bigint;
  v_next_seq integer;
begin
  v_user_id :=
    nullif(btrim(coalesce(p_user_id, '')), '');

  if v_user_id is null
     or p_session_id is null
     or p_request_id is null
     or p_expected_event_seq is null
     or p_expected_event_seq < 1
     or p_expected_event_seq >= 2147483647
     or p_final_score is null
     or p_final_score < 0
     or p_final_score > 1000000
     or p_final_best_combo is null
     or p_final_best_combo < 0
     or p_final_best_combo > 1000000
  then
    raise exception
      'REVIVAL_FINALIZE_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Every lifecycle RPC takes this session lock.
   *
   * Serializes finalize against pending,
   * revival and concurrent finalize requests.
   */

  select *
    into v_session
  from public.cing_offline_revive_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception
      'REVIVAL_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_session.user_id <> v_user_id then
    raise exception
      'REVIVAL_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Look up the durable request after locking.
   * A replay must never perform another insert.
   */

  select *
    into v_existing
  from public.cing_offline_revive_events e
  where e.user_id = v_user_id
    and e.request_id = p_request_id;

  if found then

    if v_existing.session_id <> v_session.id
       or v_existing.event_type <> 'finalized'
       or v_session.status <> 'finalized'
       or v_session.final_score
          is distinct from p_final_score
       or v_session.final_best_combo
          is distinct from p_final_best_combo
    then
      raise exception
        'REVIVAL_FINALIZE_REQUEST_CONFLICT'
        using errcode = '23505';
    end if;

    select *
      into v_score
    from public.game_scores g
    where g.offline_revive_session_id =
      v_session.id;

    if not found then
      raise exception
        'REVIVAL_FINALIZE_SCORE_INCONSISTENT'
        using errcode = '55000';
    end if;

    if v_score.game_key <> v_session.game_key
       or v_score.user_id <> v_user_id
       or v_score.score <> p_final_score
       or v_existing.event_seq <>
          v_session.event_seq
    then
      raise exception
        'REVIVAL_FINALIZE_REPLAY_INCONSISTENT'
        using errcode = '55000';
    end if;

    return query
    select
      false,
      v_session.id,
      v_existing.id,
      v_existing.event_seq,
      v_score.id::bigint,
      v_session.final_score,
      v_session.final_best_combo,
      'finalized'::text;

    return;
  end if;

  /*
   * A different finalize request cannot overwrite
   * an already finalized session.
   */

  if v_session.status = 'finalized' then
    raise exception
      'REVIVAL_SESSION_ALREADY_FINALIZED'
      using errcode = '23505';
  end if;

  if v_session.status <> 'revive_pending' then
    raise exception
      'REVIVAL_FINALIZE_STATE_CONFLICT'
      using errcode = '23505';
  end if;

  if v_session.event_seq <>
     p_expected_event_seq
  then
    raise exception
      'REVIVAL_EVENT_SEQUENCE_CONFLICT'
      using errcode = '23505';
  end if;

  /*
   * The game and user are sourced exclusively
   * from the locked PostgreSQL session.
   *
   * No p_game_key or p_user_id from client body
   * is accepted as game score authority.
   */

  insert into public.game_scores (
    game_key,
    user_id,
    player_name,
    avatar,
    score,
    offline_revive_session_id
  )
  values (
    v_session.game_key,
    v_user_id,
    coalesce(
      nullif(btrim(p_player_name), ''),
      'Cing iu'
    ),
    coalesce(p_avatar, ''),
    p_final_score,
    v_session.id
  )
  returning *
    into v_score;

  v_next_seq := v_session.event_seq + 1;

  insert into public.cing_offline_revive_events (
    session_id,
    user_id,
    request_id,
    event_seq,
    event_type
  )
  values (
    v_session.id,
    v_user_id,
    p_request_id,
    v_next_seq,
    'finalized'
  )
  returning id
    into v_event_id;

  update public.cing_offline_revive_sessions s
  set status = 'finalized',
      event_seq = v_next_seq,
      pending_reason = null,
      pending_at = null,
      finalized_at = now(),
      final_score = p_final_score,
      final_best_combo =
        p_final_best_combo
  where s.id = v_session.id;

  return query
  select
    true,
    v_session.id,
    v_event_id,
    v_next_seq,
    v_score.id::bigint,
    p_final_score,
    p_final_best_combo,
    'finalized'::text;

end;
$$;

revoke all
on function public.cing_offline_revive_finalize_v1(
  text,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  text,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.cing_offline_revive_finalize_v1(
  text,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  text,
  text
)
to service_role;

commit;
