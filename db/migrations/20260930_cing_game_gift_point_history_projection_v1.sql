/*
============================================================
 CING GAME GIFT — LOYALTY POINT HISTORY PROJECTION V1

 PURPOSE
 -------
 Project the already-authoritative Gift loyalty-point debit
 from public.point_transactions into the existing customer
 Membership history read model public.analytics_events.

 AUTHORITY
 ---------
 - public.point_transactions remains the permanent loyalty
   point ledger.
 - public.analytics_events is a compatibility/read projection
   only because /profile-update/points-history/:userId reads
   points_added / points_deducted from that table.

 SAFETY
 ------
 - NO player balance mutation.
 - NO point_transactions mutation.
 - NO Gift purchase mutation.
 - NO iPOS mutation.
 - Historical backfill derives only from canonical ledger.
 - Exactly one history row per Gift purchase id.
============================================================
*/


/* ----------------------------------------------------------
 * 1. Idempotency authority.
 * ---------------------------------------------------------- */

create unique index if not exists
  analytics_events_game_gift_point_projection_uq
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
  event_name = 'points_deducted'
  and
  metadata ->> 'reference_type' =
    'game_gift_purchase_points'
  and
  nullif(
    metadata ->> 'reference_id',
    ''
  ) is not null;


/* ----------------------------------------------------------
 * 2. Authoritative Gift point ledger -> customer history.
 * ---------------------------------------------------------- */

create or replace function
public.project_game_gift_point_history_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift_purchase_id text;
begin

  /*
   * Only canonical point-funded Game Gift ledger rows.
   *
   * V2 Gift purchase currently wraps the established V1
   * atomic core, therefore the durable point ledger source
   * remains cing_game_gift_purchase_v1.
   */
  if
    new.transaction_type <> 'deduct'
    or new.points >= 0
    or new.metadata ->> 'source'
         <> 'cing_game_gift_purchase_v1'
  then
    return new;
  end if;

  v_gift_purchase_id :=
    nullif(
      btrim(
        coalesce(
          new.metadata ->> 'gift_purchase_id',
          ''
        )
      ),
      ''
    );

  if v_gift_purchase_id is null then
    raise exception
      'GAME_GIFT_POINT_HISTORY_REFERENCE_MISSING'
      using errcode = '55000';
  end if;

  /*
   * Ledger arithmetic must be internally consistent before
   * any compatibility history is published.
   */
  if
    new.balance_before is null
    or new.balance_after is null
    or new.balance_after
         <> new.balance_before + new.points
  then
    raise exception
      'GAME_GIFT_POINT_HISTORY_LEDGER_ARITHMETIC_INVALID'
      using errcode = '55000';
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

    'points_deducted',

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
          'Tặng vật phẩm Cing Game Center'
        ),

      'source',
        'cing_game_gift_purchase_v1',

      'new_total',
        new.balance_after,

      'balance_before',
        new.balance_before,

      'transaction_type',
        new.transaction_type,

      'point_transaction_id',
        new.id,

      'gift_purchase_id',
        v_gift_purchase_id,

      'gift_id',
        new.metadata ->> 'gift_id',

      'recipient_user_id',
        new.metadata ->> 'recipient_user_id',

      'points_cost',
        new.metadata ->> 'points_cost',

      'charm_awarded',
        new.metadata ->> 'charm_awarded'
    ),

    jsonb_build_object(
      'reference_type',
        'game_gift_purchase_points',

      'reference_id',
        v_gift_purchase_id,

      'point_transaction_id',
        new.id,

      'transaction_type',
        new.transaction_type,

      'source',
        'cing_game_gift_purchase_v1'
    ),

    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;


/* ----------------------------------------------------------
 * 3. Future ledger projection.
 * ---------------------------------------------------------- */

drop trigger if exists
  project_game_gift_point_history_v1
on public.point_transactions;

create trigger
  project_game_gift_point_history_v1
after insert
on public.point_transactions
for each row
when (
  new.transaction_type = 'deduct'
  and new.points < 0
)
execute function
  public.project_game_gift_point_history_v1();


/* ----------------------------------------------------------
 * 4. Historical canonical Gift point-ledger backfill.
 *
 * analytics_events only.
 * Preserve authoritative ledger timestamp.
 * NO financial mutation.
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

  'points_deducted',

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
        'Tặng vật phẩm Cing Game Center'
      ),

    'source',
      'cing_game_gift_purchase_v1',

    'new_total',
      pt.balance_after,

    'balance_before',
      pt.balance_before,

    'transaction_type',
      pt.transaction_type,

    'point_transaction_id',
      pt.id,

    'gift_purchase_id',
      pt.metadata ->> 'gift_purchase_id',

    'gift_id',
      pt.metadata ->> 'gift_id',

    'recipient_user_id',
      pt.metadata ->> 'recipient_user_id',

    'points_cost',
      pt.metadata ->> 'points_cost',

    'charm_awarded',
      pt.metadata ->> 'charm_awarded'
  ),

  jsonb_build_object(
    'reference_type',
      'game_gift_purchase_points',

    'reference_id',
      pt.metadata ->> 'gift_purchase_id',

    'point_transaction_id',
      pt.id,

    'transaction_type',
      pt.transaction_type,

    'source',
      'cing_game_gift_purchase_v1'
  ),

  pt.created_at

from public.point_transactions pt

where
  pt.transaction_type = 'deduct'
  and
  pt.points < 0
  and
  pt.metadata ->> 'source' =
    'cing_game_gift_purchase_v1'
  and
  nullif(
    btrim(
      coalesce(
        pt.metadata ->> 'gift_purchase_id',
        ''
      )
    ),
    ''
  ) is not null
  and
  pt.balance_before is not null
  and
  pt.balance_after is not null
  and
  pt.balance_after =
    pt.balance_before + pt.points

on conflict do nothing;


/* ----------------------------------------------------------
 * 5. Postconditions.
 *
 * Every canonical Gift point ledger must have exactly one
 * corresponding customer-history projection.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_missing bigint;
  v_duplicate bigint;
  v_bad_arithmetic bigint;
begin

  select count(*)
  into v_bad_arithmetic
  from public.point_transactions pt
  where
    pt.transaction_type = 'deduct'
    and
    pt.points < 0
    and
    pt.metadata ->> 'source' =
      'cing_game_gift_purchase_v1'
    and
    (
      nullif(
        btrim(
          coalesce(
            pt.metadata ->> 'gift_purchase_id',
            ''
          )
        ),
        ''
      ) is null
      or
      pt.balance_before is null
      or
      pt.balance_after is null
      or
      pt.balance_after
        <> pt.balance_before + pt.points
    );

  if v_bad_arithmetic <> 0 then
    raise exception
      'GAME_GIFT_POINT_HISTORY_CANONICAL_LEDGER_INVALID'
      using
        errcode = '55000',
        detail = jsonb_build_object(
          'invalid_rows',
          v_bad_arithmetic
        )::text;
  end if;


  select count(*)
  into v_missing
  from public.point_transactions pt
  where
    pt.transaction_type = 'deduct'
    and
    pt.points < 0
    and
    pt.metadata ->> 'source' =
      'cing_game_gift_purchase_v1'
    and not exists (
      select 1
      from public.analytics_events ae
      where
        ae.event_name =
          'points_deducted'
        and
        ae.metadata ->> 'reference_type' =
          'game_gift_purchase_points'
        and
        ae.metadata ->> 'reference_id' =
          pt.metadata ->> 'gift_purchase_id'
    );

  if v_missing <> 0 then
    raise exception
      'GAME_GIFT_POINT_HISTORY_PROJECTION_MISSING'
      using
        errcode = '55000',
        detail = jsonb_build_object(
          'missing_rows',
          v_missing
        )::text;
  end if;


  select count(*)
  into v_duplicate
  from (
    select
      ae.metadata ->> 'reference_id'
        as gift_purchase_id,
      count(*) as row_count
    from public.analytics_events ae
    where
      ae.event_name =
        'points_deducted'
      and
      ae.metadata ->> 'reference_type' =
        'game_gift_purchase_points'
    group by
      ae.metadata ->> 'reference_id'
    having count(*) <> 1
  ) d;

  if v_duplicate <> 0 then
    raise exception
      'GAME_GIFT_POINT_HISTORY_PROJECTION_DUPLICATE'
      using
        errcode = '55000',
        detail = jsonb_build_object(
          'duplicate_references',
          v_duplicate
        )::text;
  end if;

end
$migration$;


/* ----------------------------------------------------------
 * 6. Security.
 *
 * Trigger function is not a public RPC.
 * ---------------------------------------------------------- */

revoke all
on function
  public.project_game_gift_point_history_v1()
from public;

revoke all
on function
  public.project_game_gift_point_history_v1()
from anon;

revoke all
on function
  public.project_game_gift_point_history_v1()
from authenticated;

revoke all
on function
  public.project_game_gift_point_history_v1()
from service_role;
