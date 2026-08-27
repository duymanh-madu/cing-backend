begin;


/*
 * ==========================================================
 * CING REWARD — DAILY MISSION DUAL-REWARD AUTHORITY V1
 * ==========================================================
 *
 * Daily missions may award:
 *
 *   - game plays only
 *   - loyalty points only
 *   - both
 *
 * Cing Wallet is intentionally outside this authority.
 *
 * One PostgreSQL transaction owns:
 *
 *   mission completion
 *   + reward snapshot
 *   + player game-play balance
 *   + player loyalty-point balance
 *   + game-play ledger
 *   + loyalty-point ledger
 *
 * Existing UNIQUE:
 *
 *   (user_id, mission_date, mission_type)
 *
 * remains the canonical mission-completion fence.
 */


/* ----------------------------------------------------------
 * Mission completion reward snapshot.
 * ---------------------------------------------------------- */

alter table
  public.daily_missions
add column if not exists
  points_awarded integer not null
  default 0;

alter table
  public.daily_missions
add column if not exists
  reward_snapshot jsonb;

alter table
  public.daily_missions
add column if not exists
  reward_applied_at timestamptz;


/*
 * Point ledger receives a first-class canonical mission
 * identity instead of relying only on JSON metadata.
 */
alter table
  public.point_transactions
add column if not exists
  mission_id uuid;


/* ----------------------------------------------------------
 * Domain constraints.
 *
 * NOT VALID preserves historical compatibility while every
 * new/updated row is immediately subject to the constraint.
 * Historical validation can be performed separately after
 * forensic verification.
 * ---------------------------------------------------------- */

alter table
  public.daily_missions
add constraint
  daily_missions_plays_awarded_nonnegative
check (
  coalesce(
    plays_awarded,
    0
  ) >= 0
)
not valid;

alter table
  public.daily_missions
add constraint
  daily_missions_points_awarded_nonnegative
check (
  points_awarded >= 0
)
not valid;

alter table
  public.mission_configs
add constraint
  mission_configs_plays_nonnegative
check (
  coalesce(
    plays,
    0
  ) >= 0
)
not valid;

alter table
  public.mission_configs
add constraint
  mission_configs_points_nonnegative
check (
  coalesce(
    points,
    0
  ) >= 0
)
not valid;

alter table
  public.mission_configs
add constraint
  mission_configs_reward_nonempty
check (
  coalesce(
    plays,
    0
  ) > 0
  or
  coalesce(
    points,
    0
  ) > 0
)
not valid;


/* ----------------------------------------------------------
 * Canonical ledger identity fences.
 * ---------------------------------------------------------- */

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
        'point_transactions_mission_fk'
  ) then
    alter table
      public.point_transactions
    add constraint
      point_transactions_mission_fk
    foreign key (
      mission_id
    )
    references
      public.daily_missions(id)
    on delete restrict;
  end if;
end;
$migration$;


create unique index if not exists
  point_transactions_daily_mission_uq
on public.point_transactions (
  mission_id
)
where
  mission_id is not null
  and transaction_type = 'add';


create unique index if not exists
  game_play_transactions_daily_mission_uq
on public.game_play_transactions (
  reference_type,
  reference_id
)
where
  reference_type = 'daily_mission'
  and reference_id is not null;


/* ----------------------------------------------------------
 * Atomic dual-reward authority.
 * ---------------------------------------------------------- */

create or replace function
public.complete_daily_mission_atomic(
  p_user_id text,
  p_mission_date date,
  p_mission_type text,
  p_plays integer,
  p_points integer,
  p_mission_label text default null
)
returns table (
  applied boolean,
  mission_id uuid,
  plays_awarded integer,
  points_awarded integer,
  game_plays_after integer,
  total_points_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing
    public.daily_missions%rowtype;

  v_player
    public.players%rowtype;

  v_mission_id uuid;

  v_plays integer :=
    coalesce(
      p_plays,
      0
    );

  v_points integer :=
    coalesce(
      p_points,
      0
    );

  v_game_before integer;
  v_game_after integer;

  v_points_numeric numeric;
  v_points_before integer;
  v_points_after integer;

  v_label text :=
    nullif(
      btrim(
        coalesce(
          p_mission_label,
          ''
        )
      ),
      ''
    );
begin
  if
    nullif(
      btrim(
        coalesce(
          p_user_id,
          ''
        )
      ),
      ''
    )
    is null
  then
    raise exception
      'DAILY_MISSION_USER_ID_REQUIRED'
      using errcode = '22023';
  end if;


  if p_mission_date is null then
    raise exception
      'DAILY_MISSION_DATE_REQUIRED'
      using errcode = '22023';
  end if;


  if
    nullif(
      btrim(
        coalesce(
          p_mission_type,
          ''
        )
      ),
      ''
    )
    is null
  then
    raise exception
      'DAILY_MISSION_TYPE_REQUIRED'
      using errcode = '22023';
  end if;


  if v_plays < 0 then
    raise exception
      'DAILY_MISSION_PLAYS_INVALID'
      using errcode = '22023';
  end if;


  if v_points < 0 then
    raise exception
      'DAILY_MISSION_POINTS_INVALID'
      using errcode = '22023';
  end if;


  if
    v_plays = 0
    and v_points = 0
  then
    raise exception
      'DAILY_MISSION_REWARD_EMPTY'
      using errcode = '22023';
  end if;


  /*
   * The player row is the serialization boundary for BOTH
   * reward balances.
   */
  select p.*
  into v_player
  from public.players p
  where p.user_id =
    p_user_id
  for update;


  if not found then
    raise exception
      'DAILY_MISSION_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  /*
   * Recheck mission idempotency only after player
   * serialization.
   */
  select m.*
  into v_existing
  from public.daily_missions m
  where m.user_id =
      p_user_id
    and m.mission_date =
      p_mission_date
    and m.mission_type =
      p_mission_type
  for update;


  if
    found
    and v_existing.completed
  then
    v_points_numeric :=
      coalesce(
        v_player.total_points,
        0
      );

    if
      v_points_numeric <>
        trunc(
          v_points_numeric
        )
      or
      v_points_numeric < 0
      or
      v_points_numeric >
        2147483647
    then
      raise exception
        'DAILY_MISSION_POINT_BALANCE_DOMAIN_INVALID'
        using errcode = '55000';
    end if;

    return query
    select
      false,
      v_existing.id,
      coalesce(
        v_existing.plays_awarded,
        0
      ),
      coalesce(
        v_existing.points_awarded,
        0
      ),
      coalesce(
        v_player.game_plays,
        0
      ),
      v_points_numeric::integer;

    return;
  end if;


  /* --------------------------------------------------------
   * Exact balance-domain validation.
   * -------------------------------------------------------- */

  v_game_before :=
    coalesce(
      v_player.game_plays,
      0
    );


  if v_game_before < 0 then
    raise exception
      'DAILY_MISSION_GAME_PLAY_BALANCE_INVALID'
      using errcode = '55000';
  end if;


  if
    v_game_before >
      2147483647 -
      v_plays
  then
    raise exception
      'DAILY_MISSION_GAME_PLAY_BALANCE_OVERFLOW'
      using errcode = '22003';
  end if;


  v_game_after :=
    v_game_before +
    v_plays;


  v_points_numeric :=
    coalesce(
      v_player.total_points,
      0
    );


  if
    v_points_numeric <>
      trunc(
        v_points_numeric
      )
    or
    v_points_numeric < 0
    or
    v_points_numeric >
      2147483647
  then
    raise exception
      'DAILY_MISSION_POINT_BALANCE_DOMAIN_INVALID'
      using errcode = '55000';
  end if;


  v_points_before :=
    v_points_numeric::integer;


  if
    v_points_before >
      2147483647 -
      v_points
  then
    raise exception
      'DAILY_MISSION_POINT_BALANCE_OVERFLOW'
      using errcode = '22003';
  end if;


  v_points_after :=
    v_points_before +
    v_points;


  /* --------------------------------------------------------
   * Mutate both balances inside this transaction.
   * -------------------------------------------------------- */

  update public.players p
  set
    game_plays =
      v_game_after,
    total_points =
      v_points_after
  where p.user_id =
    p_user_id;


  /*
   * Mission completion is also the immutable reward snapshot.
   */
  insert into
    public.daily_missions (
      user_id,
      mission_date,
      mission_type,
      completed,
      plays_awarded,
      points_awarded,
      completed_at,
      reward_snapshot,
      reward_applied_at
    )
  values (
    p_user_id,
    p_mission_date,
    p_mission_type,
    true,
    v_plays,
    v_points,
    clock_timestamp(),
    jsonb_build_object(
      'plays',
      v_plays,
      'points',
      v_points,
      'label',
      v_label
    ),
    clock_timestamp()
  )
  on conflict (
    user_id,
    mission_date,
    mission_type
  )
  do update
  set
    completed =
      true,
    plays_awarded =
      excluded.plays_awarded,
    points_awarded =
      excluded.points_awarded,
    completed_at =
      excluded.completed_at,
    reward_snapshot =
      excluded.reward_snapshot,
    reward_applied_at =
      excluded.reward_applied_at
  returning id
  into v_mission_id;


  /* --------------------------------------------------------
   * Durable game-play ledger.
   * -------------------------------------------------------- */

  if v_plays > 0 then
    insert into
      public.game_play_transactions (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reason,
        reference_type,
        reference_id,
        metadata
      )
    values (
      p_user_id,
      'add',
      v_plays,
      v_game_before,
      v_game_after,
      coalesce(
        v_label,
        'Nhiệm vụ hoàn thành'
      ),
      'daily_mission',
      v_mission_id::text,
      jsonb_build_object(
        'source',
        'daily_mission',
        'mission_id',
        v_mission_id,
        'mission_date',
        p_mission_date,
        'mission_type',
        p_mission_type
      )
    );
  end if;


  /* --------------------------------------------------------
   * Durable loyalty-point ledger.
   * -------------------------------------------------------- */

  if v_points > 0 then
    insert into
      public.point_transactions (
        user_id,
        mission_id,
        transaction_type,
        points,
        balance_before,
        balance_after,
        reason,
        metadata
      )
    values (
      p_user_id,
      v_mission_id,
      'add',
      v_points,
      v_points_before,
      v_points_after,
      coalesce(
        v_label,
        'Nhiệm vụ hoàn thành'
      ),
      jsonb_build_object(
        'source',
        'daily_mission',
        'mission_id',
        v_mission_id,
        'mission_date',
        p_mission_date,
        'mission_type',
        p_mission_type
      )
    );
  end if;


  return query
  select
    true,
    v_mission_id,
    v_plays,
    v_points,
    v_game_after,
    v_points_after;
end;
$$;


/* ----------------------------------------------------------
 * Backend-only authority.
 * ---------------------------------------------------------- */

revoke all on function
  public.complete_daily_mission_atomic(
    text,
    date,
    text,
    integer,
    integer,
    text
  )
from public;

revoke all on function
  public.complete_daily_mission_atomic(
    text,
    date,
    text,
    integer,
    integer,
    text
  )
from anon;

revoke all on function
  public.complete_daily_mission_atomic(
    text,
    date,
    text,
    integer,
    integer,
    text
  )
from authenticated;


grant execute on function
  public.complete_daily_mission_atomic(
    text,
    date,
    text,
    integer,
    integer,
    text
  )
to service_role;


commit;
