begin;

/*
 * CING GAME CENTER V2
 * SNAPSHOT-BOUND DAILY CHALLENGE REWARD V1
 *
 * Apply after Finalize Snapshot Binding V1.
 *
 * No client-reported progress is accepted.
 * No reward is granted during Pending or Revive.
 */

create function
public.cing_offline_revive_challenge_reward_v1(
  p_session_id uuid,
  p_user_id text,
  p_worker_token uuid
)
returns table (
  applied boolean,
  challenge_id uuid,
  snapshot_id uuid,
  winner_user_id text,
  winner_name text,
  winner_session_id uuid,
  reward_points integer,
  total_points_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cing_offline_revive_sessions%rowtype;
  v_score public.game_scores%rowtype;
  v_snapshot public.cing_offline_revive_challenge_snapshots%rowtype;
  v_challenge public.daily_challenges%rowtype;
  v_player public.players%rowtype;

  v_user_id text;
  v_progress integer;
  v_reward integer;
  v_before_numeric numeric;
  v_before integer;
  v_after integer;
  v_winner_session_id uuid;
  v_now timestamptz;
begin

  v_user_id :=
    nullif(btrim(coalesce(p_user_id, '')), '');

  if p_session_id is null
    or v_user_id is null
    or p_worker_token is null
  then
    raise exception
      'REVIVAL_REWARD_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  /*
   * First lock the finalized session.
   * No caller may substitute a game key.
   */

  select s.*
  into v_session
  from public.cing_offline_revive_sessions s
  where s.id = p_session_id
    and s.user_id = v_user_id
  for update;

  if not found then
    raise exception
      'REVIVAL_REWARD_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_session.status <> 'finalized'
    or v_session.finalized_at is null
    or v_session.challenge_snapshot_id is null
    or v_session.game_key not in (
      'black-pearl-rush',
      'cing-stack-tower'
    )
  then
    raise exception
      'REVIVAL_REWARD_FINALIZE_REQUIRED'
      using errcode = '55000';
  end if;

  /*
   * Same serialization boundary as
   * Admin Apply and Finalize Binding.
   *
   * Lock order:
   * session -> app_configs -> daily_challenges
   * -> players.
   */

  perform 1
  from public.app_configs c
  where c.id = 1
  for update;

  if not found then
    raise exception
      'REVIVAL_REWARD_CONFIG_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Read only the snapshot physically
   * bound to this finalized session.
   */

  select sn.*
  into v_snapshot
  from public.cing_offline_revive_challenge_snapshots sn
  where sn.snapshot_id =
    v_session.challenge_snapshot_id;

  if not found
    or v_snapshot.enabled is distinct from true
    or v_snapshot.challenge_id is null
    or v_snapshot.game_key <> v_session.game_key
    or v_snapshot.challenge_date <> (
      v_session.finalized_at
      at time zone 'Asia/Ho_Chi_Minh'
    )::date
    or v_snapshot.applied_at >
      v_session.finalized_at
    or v_snapshot.challenge_type not in (
      'combo',
      'score'
    )
    or v_snapshot.target_value not between
      1 and 1000000
    or v_snapshot.reward_points not between
      1 and 1000000
  then
    raise exception
      'REVIVAL_REWARD_SNAPSHOT_INELIGIBLE'
      using errcode = '55000';
  end if;

  select g.*
  into v_score
  from public.game_scores g
  where g.offline_revive_session_id =
    v_session.id
    and g.user_id = v_session.user_id
    and g.game_key = v_session.game_key;

  if not found
    or v_score.played_at is distinct from
      v_session.finalized_at
    or v_score.score is distinct from
      v_session.final_score
  then
    raise exception
      'REVIVAL_REWARD_SCORE_INCONSISTENT'
      using errcode = '55000';
  end if;

  /*
   * Fence every reward outcome,
   * including completed/replay.
   */
  perform 1
  from public.cing_offline_revive_score_outbox o
  where o.score_id = v_score.id
    and o.session_id = v_session.id
    and o.user_id = v_user_id
    and o.reward_status = 'processing'
    and o.reward_worker_token = p_worker_token
    and o.reward_locked_until > clock_timestamp()
  for update;

  if not found then
    raise exception
      'REVIVAL_REWARD_LEASE_INVALID'
      using errcode = '55000';
  end if;
  v_progress :=
    case v_snapshot.challenge_type
      when 'combo' then
        v_session.final_best_combo
      when 'score' then
        v_score.score
    end;

  if v_progress is null
    or v_progress < v_snapshot.target_value
  then
    raise exception
      'REVIVAL_REWARD_TARGET_NOT_REACHED'
      using errcode = '22023';
  end if;

  /*
   * Canonical winner authority:
   * one challenge per game / VN day.
   */

  select c.*
  into v_challenge
  from public.daily_challenges c
  where c.id = v_snapshot.challenge_id
  for update;

  if not found
    or v_challenge.game_key <>
      v_session.game_key
    or v_challenge.challenge_date <>
      v_snapshot.challenge_date
  then
    raise exception
      'REVIVAL_REWARD_CHALLENGE_MISMATCH'
      using errcode = '55000';
  end if;

  /*
   * A second claimant or retry is
   * financially inert.
   */

  if coalesce(v_challenge.completed, false) then
    /* Read durable winning-session provenance. */
    select nullif(
      t.metadata ->> 'revival_session_id',
      ''
    )::uuid
    into v_winner_session_id
    from public.point_transactions t
    where t.daily_challenge_id = v_challenge.id
      and t.transaction_type = 'add'
      and t.user_id = v_challenge.winner_user_id;

    return query
    select
      false,
      v_challenge.id,
      v_snapshot.snapshot_id,
      v_challenge.winner_user_id,
      v_challenge.winner_name,
      v_winner_session_id,
      coalesce(v_challenge.reward_points, 0),
      coalesce(
        (
          select p.total_points::integer
          from public.players p
          where p.user_id = v_user_id
        ),
        0
      );

    return;
  end if;

  v_reward := v_snapshot.reward_points;

  /*
   * Serialize player balance mutation
   * with existing financial authorities.
   */

  select p.*
  into v_player
  from public.players p
  where p.user_id = v_user_id
  for update;

  if not found then
    raise exception
      'REVIVAL_REWARD_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  v_before_numeric :=
    coalesce(v_player.total_points, 0);

  if v_before_numeric <>
      trunc(v_before_numeric)
    or v_before_numeric < 0
    or v_before_numeric > 2147483647
  then
    raise exception
      'REVIVAL_REWARD_BALANCE_INVALID'
      using errcode = '55000';
  end if;

  v_before := v_before_numeric::integer;

  if v_before > 2147483647 - v_reward then
    raise exception
      'REVIVAL_REWARD_BALANCE_OVERFLOW'
      using errcode = '22003';
  end if;

  v_after := v_before + v_reward;
  v_now := clock_timestamp();

  update public.players
  set total_points = v_after
  where user_id = v_user_id;

  /*
   * Store the ACTUAL awarded snapshot
   * target/reward on the completed row.
   *
   * Admin Apply must never rewrite a
   * completed daily challenge.
   */

  update public.daily_challenges
  set
    challenge_type =
      v_snapshot.challenge_type,
    target_value =
      v_snapshot.target_value,
    reward_points =
      v_reward,
    winner_user_id =
      v_user_id,
    winner_name =
      v_score.player_name,
    winner_avatar =
      v_score.avatar,
    completed = true,
    completed_at = v_now,
    ipos_sync_status = 'pending',
    ipos_retry_count = 0,
    ipos_next_retry_at = v_now,
    ipos_locked_until = null,
    ipos_synced_at = null,
    ipos_last_error = null
  where id = v_challenge.id;

  /*
   * Reuse the existing unique ledger
   * identity: daily_challenge_id + add.
   */

  insert into public.point_transactions (
    user_id,
    transaction_type,
    points,
    balance_before,
    balance_after,
    reason,
    metadata,
    daily_challenge_id
  )
  values (
    v_user_id,
    'add',
    v_reward,
    v_before,
    v_after,
    'Phần thưởng thử thách ngày',
    jsonb_build_object(
      'phone', v_user_id,
      'daily_challenge_id', v_challenge.id,
      'challenge_date', v_snapshot.challenge_date,
      'game_key', v_session.game_key,
      'revival_session_id', v_session.id,
      'revival_score_id', v_score.id,
      'challenge_snapshot_id', v_snapshot.snapshot_id,
      'challenge_type', v_snapshot.challenge_type,
      'target_value', v_snapshot.target_value,
      'progress', v_progress
    ),
    v_challenge.id
  );

  /*
   * Persist notification intent in the
   * SAME transaction as point credit.
   *
   * Reward processing must have been
   * claimed before this RPC is called.
   */

  update public.cing_offline_revive_score_outbox o
  set
    reward_applied = true,
    reward_challenge_id = v_challenge.id,
    reward_snapshot_id = v_snapshot.snapshot_id,
    reward_processed_at = v_now,
    reward_notification_status = 'pending'
  where o.score_id = v_score.id
    and o.session_id = v_session.id
    and o.user_id = v_user_id
    and o.reward_status = 'processing'
    and o.reward_worker_token = p_worker_token
    and o.reward_locked_until > clock_timestamp();

  if not found then
    raise exception
      'REVIVAL_REWARD_OUTBOX_NOT_CLAIMED'
      using errcode = '55000';
  end if;

  return query
  select
    true,
    v_challenge.id,
    v_snapshot.snapshot_id,
    v_user_id,
    v_score.player_name,
    v_session.id,
    v_reward,
    v_after;

end;
$$;

revoke all
on function
public.cing_offline_revive_challenge_reward_v1(
  uuid,
  text,
  uuid
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_offline_revive_challenge_reward_v1(
  uuid,
  text,
  uuid
)
to service_role;

commit;
