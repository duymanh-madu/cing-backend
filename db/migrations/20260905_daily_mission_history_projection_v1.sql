begin;


/*
 * ==========================================================
 * CING DAILY MISSION — DURABLE HISTORY PROJECTION V1
 * ==========================================================
 *
 * Authoritative sources:
 *
 *   game_play_transactions
 *   point_transactions
 *
 * analytics_events remains a backward-compatible read
 * projection for profile history only.
 *
 * No player balance is mutated by this migration.
 */


/* ----------------------------------------------------------
 * Existing canonical projection must not already contain
 * ambiguous duplicates.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_duplicate_count bigint;
begin
  select count(*)
  into v_duplicate_count
  from (
    select
      ae.event_name,
      ae.metadata ->> 'reference_id'
        as reference_id
    from public.analytics_events ae
    where
      ae.event_name in (
        'plays_added',
        'points_added'
      )
      and
      ae.metadata ->> 'reference_type' =
        'daily_mission'
      and nullif(
        ae.metadata ->> 'reference_id',
        ''
      ) is not null
    group by
      ae.event_name,
      ae.metadata ->> 'reference_id'
    having count(*) > 1
  ) duplicates;

  if v_duplicate_count > 0 then
    raise exception
      'DAILY_MISSION_HISTORY_EXISTING_DUPLICATES';
  end if;
end;
$migration$;


/* ----------------------------------------------------------
 * Canonical idempotency fence.
 *
 * One mission may legitimately have TWO projections:
 *
 *   plays_added
 *   points_added
 *
 * but never two of the same projection type.
 * ---------------------------------------------------------- */

create unique index if not exists
  analytics_events_daily_mission_reward_projection_uq
on public.analytics_events (
  event_name,
  (
    metadata ->> 'reference_type'
  ),
  (
    metadata ->> 'reference_id'
  )
)
where
  event_name in (
    'plays_added',
    'points_added'
  )
  and
  metadata ->> 'reference_type' =
    'daily_mission'
  and
  nullif(
    metadata ->> 'reference_id',
    ''
  ) is not null;


/* ----------------------------------------------------------
 * Game-play ledger → history projection.
 * ---------------------------------------------------------- */

create or replace function
public.project_daily_mission_game_play_history_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    new.reference_type <>
      'daily_mission'
    or
    new.transaction_type <>
      'add'
    or
    new.amount <= 0
    or
    nullif(
      new.reference_id,
      ''
    ) is null
  then
    return new;
  end if;

  insert into
    public.analytics_events (
      user_id,
      event_name,
      event_data,
      metadata,
      created_at
    )
  values (
    new.user_id,

    'plays_added',

    jsonb_build_object(
      'amount',
        new.amount,

      'reason',
        coalesce(
          nullif(
            btrim(
              coalesce(
                new.reason,
                ''
              )
            ),
            ''
          ),
          'Nhiệm vụ hoàn thành'
        ),

      'source',
        'daily_mission',

      'new_total',
        new.balance_after,

      'mission_id',
        new.reference_id
    ),

    jsonb_build_object(
      'reference_type',
        'daily_mission',

      'reference_id',
        new.reference_id,

      'mission_id',
        new.reference_id
    ),

    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;


revoke all on function
  public.project_daily_mission_game_play_history_v1()
from public;

revoke all on function
  public.project_daily_mission_game_play_history_v1()
from anon;

revoke all on function
  public.project_daily_mission_game_play_history_v1()
from authenticated;


/* ----------------------------------------------------------
 * Loyalty-point ledger → history projection.
 * ---------------------------------------------------------- */

create or replace function
public.project_daily_mission_point_history_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    new.mission_id is null
    or
    new.transaction_type <>
      'add'
    or
    new.points <= 0
  then
    return new;
  end if;

  insert into
    public.analytics_events (
      user_id,
      event_name,
      event_data,
      metadata,
      created_at
    )
  values (
    new.user_id,

    'points_added',

    jsonb_build_object(
      'amount',
        new.points,

      'reason',
        coalesce(
          nullif(
            btrim(
              coalesce(
                new.reason,
                ''
              )
            ),
            ''
          ),
          'Nhiệm vụ hoàn thành'
        ),

      'source',
        'daily_mission',

      'new_total',
        new.balance_after,

      'mission_id',
        new.mission_id
    ),

    jsonb_build_object(
      'reference_type',
        'daily_mission',

      'reference_id',
        new.mission_id::text,

      'mission_id',
        new.mission_id
    ),

    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;


revoke all on function
  public.project_daily_mission_point_history_v1()
from public;

revoke all on function
  public.project_daily_mission_point_history_v1()
from anon;

revoke all on function
  public.project_daily_mission_point_history_v1()
from authenticated;


/* ----------------------------------------------------------
 * Install ledger-bound triggers.
 * ---------------------------------------------------------- */

drop trigger if exists
  trg_daily_mission_game_play_history_v1
on public.game_play_transactions;

create trigger
  trg_daily_mission_game_play_history_v1
after insert
on public.game_play_transactions
for each row
when (
  new.reference_type =
    'daily_mission'
  and
  new.transaction_type =
    'add'
  and
  new.amount > 0
  and
  new.reference_id is not null
)
execute function
  public.project_daily_mission_game_play_history_v1();


drop trigger if exists
  trg_daily_mission_point_history_v1
on public.point_transactions;

create trigger
  trg_daily_mission_point_history_v1
after insert
on public.point_transactions
for each row
when (
  new.mission_id is not null
  and
  new.transaction_type =
    'add'
  and
  new.points > 0
)
execute function
  public.project_daily_mission_point_history_v1();


/* ----------------------------------------------------------
 * Historical game-play projection backfill.
 *
 * IMPORTANT:
 *   analytics_events only.
 *   No players mutation.
 *   No game_play_transactions mutation.
 * ---------------------------------------------------------- */

insert into
  public.analytics_events (
    user_id,
    event_name,
    event_data,
    metadata,
    created_at
  )
select
  gt.user_id,

  'plays_added',

  jsonb_build_object(
    'amount',
      gt.amount,

    'reason',
      coalesce(
        nullif(
          btrim(
            coalesce(
              gt.reason,
              ''
            )
          ),
          ''
        ),
        'Nhiệm vụ hoàn thành'
      ),

    'source',
      'daily_mission',

    'new_total',
      gt.balance_after,

    'mission_id',
      gt.reference_id
  ),

  jsonb_build_object(
    'reference_type',
      'daily_mission',

    'reference_id',
      gt.reference_id,

    'mission_id',
      gt.reference_id
  ),

  gt.created_at
from
  public.game_play_transactions gt
where
  gt.reference_type =
    'daily_mission'
  and
  gt.transaction_type =
    'add'
  and
  gt.amount > 0
  and
  nullif(
    gt.reference_id,
    ''
  ) is not null
on conflict do nothing;


/* ----------------------------------------------------------
 * Historical loyalty-point projection backfill.
 *
 * IMPORTANT:
 *   analytics_events only.
 *   No players mutation.
 *   No point_transactions mutation.
 * ---------------------------------------------------------- */

insert into
  public.analytics_events (
    user_id,
    event_name,
    event_data,
    metadata,
    created_at
  )
select
  pt.user_id,

  'points_added',

  jsonb_build_object(
    'amount',
      pt.points,

    'reason',
      coalesce(
        nullif(
          btrim(
            coalesce(
              pt.reason,
              ''
            )
          ),
          ''
        ),
        'Nhiệm vụ hoàn thành'
      ),

    'source',
      'daily_mission',

    'new_total',
      pt.balance_after,

    'mission_id',
      pt.mission_id
  ),

  jsonb_build_object(
    'reference_type',
      'daily_mission',

    'reference_id',
      pt.mission_id::text,

    'mission_id',
      pt.mission_id
  ),

  pt.created_at
from
  public.point_transactions pt
where
  pt.mission_id is not null
  and
  pt.transaction_type =
    'add'
  and
  pt.points > 0
on conflict do nothing;


/* ----------------------------------------------------------
 * Postcondition:
 *
 * every authoritative Daily Mission reward ledger must have
 * exactly one corresponding compatibility projection.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_missing_plays bigint;
  v_duplicate_plays bigint;

  v_missing_points bigint;
  v_duplicate_points bigint;
begin
  select count(*)
  into v_missing_plays
  from public.game_play_transactions gt
  where
    gt.reference_type =
      'daily_mission'
    and
    gt.transaction_type =
      'add'
    and
    gt.amount > 0
    and not exists (
      select 1
      from public.analytics_events ae
      where
        ae.event_name =
          'plays_added'
        and
        ae.metadata ->> 'reference_type' =
          'daily_mission'
        and
        ae.metadata ->> 'reference_id' =
          gt.reference_id
    );

  if v_missing_plays <> 0 then
    raise exception
      'DAILY_MISSION_PLAY_HISTORY_BACKFILL_INCOMPLETE';
  end if;


  select count(*)
  into v_duplicate_plays
  from (
    select
      ae.metadata ->> 'reference_id'
    from public.analytics_events ae
    where
      ae.event_name =
        'plays_added'
      and
      ae.metadata ->> 'reference_type' =
        'daily_mission'
    group by
      ae.metadata ->> 'reference_id'
    having count(*) <> 1
  ) duplicates;

  if v_duplicate_plays <> 0 then
    raise exception
      'DAILY_MISSION_PLAY_HISTORY_DUPLICATE';
  end if;


  select count(*)
  into v_missing_points
  from public.point_transactions pt
  where
    pt.mission_id is not null
    and
    pt.transaction_type =
      'add'
    and
    pt.points > 0
    and not exists (
      select 1
      from public.analytics_events ae
      where
        ae.event_name =
          'points_added'
        and
        ae.metadata ->> 'reference_type' =
          'daily_mission'
        and
        ae.metadata ->> 'reference_id' =
          pt.mission_id::text
    );

  if v_missing_points <> 0 then
    raise exception
      'DAILY_MISSION_POINT_HISTORY_BACKFILL_INCOMPLETE';
  end if;


  select count(*)
  into v_duplicate_points
  from (
    select
      ae.metadata ->> 'reference_id'
    from public.analytics_events ae
    where
      ae.event_name =
        'points_added'
      and
      ae.metadata ->> 'reference_type' =
        'daily_mission'
    group by
      ae.metadata ->> 'reference_id'
    having count(*) <> 1
  ) duplicates;

  if v_duplicate_points <> 0 then
    raise exception
      'DAILY_MISSION_POINT_HISTORY_DUPLICATE';
  end if;
end;
$migration$;


commit;
