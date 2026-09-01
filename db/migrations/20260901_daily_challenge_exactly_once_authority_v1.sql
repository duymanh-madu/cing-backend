begin;


/*
 * ==========================================================
 * CING DAILY CHALLENGE — EXACTLY-ONCE AUTHORITY V1
 * ==========================================================
 *
 * Canonical identity:
 *
 *   challenge_date + game_key
 *
 * One PostgreSQL transaction owns:
 *
 *   winner
 *   + completion
 *   + local point balance
 *   + point ledger
 *   + durable iPOS delivery intent
 *
 * Existing historical rows are intentionally NOT queued
 * for iPOS delivery.
 *
 * Notification / popup / broadcast behavior remains Node-owned
 * and outside this authority.
 */


/* ----------------------------------------------------------
 * One challenge per game / calendar day.
 * Historical forensic already proved this key is unique.
 * ---------------------------------------------------------- */

create unique index if not exists
  daily_challenges_date_game_uq
on public.daily_challenges (
  challenge_date,
  game_key
);


/* ----------------------------------------------------------
 * Canonical point-ledger identity.
 * ---------------------------------------------------------- */

alter table public.point_transactions
add column if not exists
  daily_challenge_id uuid;


do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t
      on t.oid = c.conrelid
    join pg_namespace n
      on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'point_transactions'
      and c.conname =
        'point_transactions_daily_challenge_fk'
  ) then
    alter table public.point_transactions
    add constraint
      point_transactions_daily_challenge_fk
    foreign key (
      daily_challenge_id
    )
    references public.daily_challenges(id)
    on delete restrict;
  end if;
end;
$migration$;


create unique index if not exists
  point_transactions_daily_challenge_add_uq
on public.point_transactions (
  daily_challenge_id
)
where
  daily_challenge_id is not null
  and transaction_type = 'add';


/* ----------------------------------------------------------
 * Durable external iPOS delivery state.
 *
 * NULL means legacy / not managed by this V1 worker.
 * New successful claims are atomically set to pending.
 * ---------------------------------------------------------- */

alter table public.daily_challenges
add column if not exists
  ipos_sync_status text,
add column if not exists
  ipos_retry_count integer not null default 0,
add column if not exists
  ipos_next_retry_at timestamptz,
add column if not exists
  ipos_locked_until timestamptz,
add column if not exists
  ipos_synced_at timestamptz,
add column if not exists
  ipos_last_error text;


alter table public.daily_challenges
drop constraint if exists
  daily_challenges_ipos_sync_status_ck;

alter table public.daily_challenges
add constraint
  daily_challenges_ipos_sync_status_ck
check (
  ipos_sync_status is null
  or ipos_sync_status in (
    'pending',
    'processing',
    'synced',
    'failed'
  )
);


alter table public.daily_challenges
drop constraint if exists
  daily_challenges_ipos_retry_count_ck;

alter table public.daily_challenges
add constraint
  daily_challenges_ipos_retry_count_ck
check (
  ipos_retry_count >= 0
);


create index if not exists
  daily_challenges_ipos_pending_idx
on public.daily_challenges (
  ipos_next_retry_at,
  completed_at,
  id
)
where
  completed = true
  and ipos_sync_status = 'pending';


/* ----------------------------------------------------------
 * Atomic local reward + durable delivery authority.
 * ---------------------------------------------------------- */

create or replace function
public.complete_daily_challenge_atomic(
  p_challenge_id uuid,
  p_user_id text,
  p_player_name text,
  p_player_avatar text,
  p_progress bigint
)
returns table (
  applied boolean,
  challenge_id uuid,
  winner_user_id text,
  winner_name text,
  reward_points integer,
  total_points_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge
    public.daily_challenges%rowtype;

  v_player
    public.players%rowtype;

  v_before_numeric numeric;
  v_before integer;
  v_after integer;
  v_reward integer;
  v_now timestamptz :=
    clock_timestamp();
begin

  if p_challenge_id is null then
    raise exception
      'DAILY_CHALLENGE_ID_REQUIRED'
      using errcode = '22023';
  end if;


  if nullif(
    btrim(
      coalesce(
        p_user_id,
        ''
      )
    ),
    ''
  ) is null then
    raise exception
      'DAILY_CHALLENGE_USER_ID_REQUIRED'
      using errcode = '22023';
  end if;


  if p_progress is null
     or p_progress < 0 then
    raise exception
      'DAILY_CHALLENGE_PROGRESS_INVALID'
      using errcode = '22023';
  end if;


  /*
   * Canonical serialization boundary for competing winners.
   */
  select c.*
  into v_challenge
  from public.daily_challenges c
  where c.id = p_challenge_id
  for update;


  if not found then
    raise exception
      'DAILY_CHALLENGE_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  /*
   * Any replay after the first completed transaction is
   * financially inert.
   */
  if coalesce(
    v_challenge.completed,
    false
  ) then

    return query
    select
      false,
      v_challenge.id,
      v_challenge.winner_user_id,
      v_challenge.winner_name,
      coalesce(
        v_challenge.reward_points,
        0
      ),
      coalesce(
        (
          select
            p.total_points::integer
          from public.players p
          where p.user_id =
            p_user_id
        ),
        0
      );

    return;
  end if;


  if p_progress <
    coalesce(
      v_challenge.target_value,
      0
    ) then
    raise exception
      'DAILY_CHALLENGE_TARGET_NOT_REACHED'
      using errcode = '22023';
  end if;


  v_reward :=
    coalesce(
      v_challenge.reward_points,
      0
    );


  if v_reward <= 0 then
    raise exception
      'DAILY_CHALLENGE_REWARD_INVALID'
      using errcode = '55000';
  end if;


  /*
   * Serialize total_points mutation with other DB authorities.
   */
  select p.*
  into v_player
  from public.players p
  where p.user_id =
    p_user_id
  for update;


  if not found then
    raise exception
      'DAILY_CHALLENGE_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  v_before_numeric :=
    coalesce(
      v_player.total_points,
      0
    );


  if
    v_before_numeric <>
      trunc(
        v_before_numeric
      )
    or v_before_numeric < 0
    or v_before_numeric >
      2147483647
  then
    raise exception
      'DAILY_CHALLENGE_POINT_BALANCE_DOMAIN_INVALID'
      using errcode = '55000';
  end if;


  v_before :=
    v_before_numeric::integer;


  if v_before >
    2147483647 -
      v_reward
  then
    raise exception
      'DAILY_CHALLENGE_POINT_BALANCE_OVERFLOW'
      using errcode = '22003';
  end if;


  v_after :=
    v_before +
    v_reward;


  update public.players
  set total_points =
    v_after
  where user_id =
    p_user_id;


  /*
   * Completion and durable external delivery intent are part
   * of this SAME PostgreSQL transaction.
   */
  update public.daily_challenges
  set
    winner_user_id =
      p_user_id,
    winner_name =
      p_player_name,
    winner_avatar =
      p_player_avatar,
    completed =
      true,
    completed_at =
      v_now,

    ipos_sync_status =
      'pending',
    ipos_retry_count =
      0,
    ipos_next_retry_at =
      v_now,
    ipos_locked_until =
      null,
    ipos_synced_at =
      null,
    ipos_last_error =
      null

  where id =
    v_challenge.id;


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
    p_user_id,
    'add',
    v_reward,
    v_before,
    v_after,
    'Phần thưởng thử thách ngày',
    jsonb_build_object(
      'phone',
        p_user_id,
      'daily_challenge_id',
        v_challenge.id,
      'challenge_date',
        v_challenge.challenge_date,
      'game_key',
        v_challenge.game_key
    ),
    v_challenge.id
  );


  return query
  select
    true,
    v_challenge.id,
    p_user_id,
    p_player_name,
    v_reward,
    v_after;

end;
$$;


/* ----------------------------------------------------------
 * Authority is backend service-role only.
 * ---------------------------------------------------------- */

revoke all
on function
  public.complete_daily_challenge_atomic(
    uuid,
    text,
    text,
    text,
    bigint
  )
from public, anon, authenticated;


grant execute
on function
  public.complete_daily_challenge_atomic(
    uuid,
    text,
    text,
    text,
    bigint
  )
to service_role;


commit;
