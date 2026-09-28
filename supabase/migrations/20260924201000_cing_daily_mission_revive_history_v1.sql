begin;

/*
 * CING GAME CENTER V2
 * DAILY MISSION REVIVE CREDIT HISTORY V1
 *
 * Revive Credit ledger -> compatibility history.
 *
 * This migration:
 * - does not award credits;
 * - does not update players;
 * - does not change V1 mission history;
 * - does not replace the V1 point projection;
 * - uses the canonical mission UUID as identity.
 *
 * The trigger handles new ledger inserts.
 * The backfill handles already-existing V2 ledgers.
 */

do $migration$

begin

  if exists (

    select 1

    from public.analytics_events ae

    where ae.event_name =
      'revive_credits_added'

      and ae.metadata
        ->> 'reference_type' =
        'daily_mission_revive_v2'

      and nullif(
        ae.metadata
          ->> 'reference_id',
        ''
      ) is not null

    group by
      ae.metadata
        ->> 'reference_id'

    having count(*) > 1

  ) then

    raise exception
      'DAILY_MISSION_REVIVE_HISTORY_DUPLICATES';

  end if;

end;

$migration$;

/*
 * A Daily Mission may have one revive event
 * and one loyalty-point event.
 *
 * The new index protects only the V2 Revive
 * Credit history identity.
 */

create unique index
  if not exists
  analytics_events_daily_mission_revive_v2_uq

on public.analytics_events (

  (
    metadata
      ->> 'reference_id'
  )

)

where event_name =
  'revive_credits_added'

  and metadata
    ->> 'reference_type' =
    'daily_mission_revive_v2'

  and nullif(
    metadata
      ->> 'reference_id',
    ''
  ) is not null;

/*
 * Canonical ledger -> customer history.
 */

create function
public.project_daily_mission_revive_history_v1()

returns trigger

language plpgsql

security definer

set search_path = public

as $function$

begin

  if new.reference_type
      is distinct from
      'daily_mission_revive_v2'

    or new.amount <= 0

    or nullif(
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

    'revive_credits_added',

    jsonb_build_object(

      'amount',
      new.amount,

      'reason',
      new.reason,

      'source',
      'daily_mission',

      'reward_currency',
      'revive_credit',

      'new_total',
      new.balance_after,

      'mission_id',
      new.reference_id

    ),

    jsonb_build_object(

      'reference_type',
      'daily_mission_revive_v2',

      'reference_id',
      new.reference_id,

      'mission_id',
      new.reference_id,

      'reward_currency',
      'revive_credit'

    ),

    new.created_at

  )

  on conflict do nothing;

  return new;

end;

$function$;

revoke all

on function
public.project_daily_mission_revive_history_v1()

from public, anon, authenticated, service_role;

/*
 * New ledger entries project automatically.
 */

create trigger
  trg_daily_mission_revive_history_v1

after insert

on public.cing_revive_credit_transactions

for each row

when (

  new.reference_type =
    'daily_mission_revive_v2'

  and new.amount > 0

  and new.reference_id
    is not null

)

execute function
public.project_daily_mission_revive_history_v1();

/*
 * Backfill existing Daily Mission V2 grants.
 *
 * Analytics only; no reward mutation.
 */

insert into
  public.analytics_events (

    user_id,

    event_name,

    event_data,

    metadata,

    created_at

  )

select

  rt.user_id,

  'revive_credits_added',

  jsonb_build_object(

    'amount',
    rt.amount,

    'reason',
    rt.reason,

    'source',
    'daily_mission',

    'reward_currency',
    'revive_credit',

    'new_total',
    rt.balance_after,

    'mission_id',
    rt.reference_id

  ),

  jsonb_build_object(

    'reference_type',
    'daily_mission_revive_v2',

    'reference_id',
    rt.reference_id,

    'mission_id',
    rt.reference_id,

    'reward_currency',
    'revive_credit'

  ),

  rt.created_at

from
  public.cing_revive_credit_transactions rt

where

  rt.reference_type =
    'daily_mission_revive_v2'

  and rt.amount > 0

  and nullif(
    rt.reference_id,
    ''
  ) is not null

on conflict do nothing;

/*
 * Postcondition: every positive Daily Mission
 * Revive Credit ledger has exactly one event.
 */

do $migration$

declare

  v_missing bigint;

  v_duplicates bigint;

begin

  select count(*)

  into v_missing

  from
    public.cing_revive_credit_transactions rt

  where rt.reference_type =
      'daily_mission_revive_v2'

    and rt.amount > 0

    and not exists (

      select 1

      from public.analytics_events ae

      where ae.event_name =
          'revive_credits_added'

        and ae.metadata
          ->> 'reference_type' =
          'daily_mission_revive_v2'

        and ae.metadata
          ->> 'reference_id' =
          rt.reference_id

    );

  select count(*)

  into v_duplicates

  from (

    select
      ae.metadata
        ->> 'reference_id'

    from public.analytics_events ae

    where ae.event_name =
        'revive_credits_added'

      and ae.metadata
        ->> 'reference_type' =
        'daily_mission_revive_v2'

    group by
      ae.metadata
        ->> 'reference_id'

    having count(*) > 1

  ) duplicate_rows;

  if v_missing <> 0
    or v_duplicates <> 0
  then

    raise exception
      'DAILY_MISSION_REVIVE_HISTORY_POSTCONDITION_FAILED';

  end if;

end;

$migration$;

commit;
