/*
============================================================
 CING POINTS -> REVIVE CREDIT
 LOYALTY POINT HISTORY PROJECTION V1

 PURPOSE
 -------
 Project the already-authoritative Points-funded Revive Credit
 debit from public.point_transactions into the existing
 customer Membership history read model public.analytics_events.

 AUTHORITY
 ---------
 - public.point_transactions remains the permanent loyalty
   point ledger.
 - public.cing_revive_credit_transactions remains the permanent
   Revive Credit ledger.
 - public.analytics_events is compatibility/read projection only.
 - Canonical financial rows are never rewritten.

 CUSTOMER PRESENTATION
 ---------------------
 Customer history uses:
   "Mua Thẻ hồi sinh bằng điểm tích lũy"

 Internal ledger terminology remains unchanged.

 SAFETY
 ------
 - NO player balance mutation.
 - NO point_transactions mutation.
 - NO Revive Credit ledger mutation.
 - NO purchase receipt mutation.
 - NO iPOS mutation.
 - Historical backfill derives only from canonical point ledger.
 - Exactly one history row per purchase id.
============================================================
*/


/* ----------------------------------------------------------
 * 1. Idempotency authority.
 * ---------------------------------------------------------- */

create unique index if not exists
  analytics_events_points_revive_history_uq
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
    'points_revive_credit_purchase'
  and
  nullif(
    metadata ->> 'reference_id',
    ''
  ) is not null;


/* ----------------------------------------------------------
 * 2. Canonical point ledger -> customer history.
 * ---------------------------------------------------------- */

create or replace function
public.project_points_revive_credit_history_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id text;
begin

  /*
   * Only canonical Points-funded Revive Credit purchases.
   */
  if
    new.transaction_type <> 'deduct'
    or new.points >= 0
    or new.metadata ->> 'source'
         <> 'points_revive_credit_purchase_v1'
  then
    return new;
  end if;

  v_purchase_id :=
    nullif(
      btrim(
        coalesce(
          new.metadata ->> 'purchase_id',
          ''
        )
      ),
      ''
    );

  if v_purchase_id is null then
    raise exception
      'POINTS_REVIVE_HISTORY_REFERENCE_MISSING'
      using errcode = '55000';
  end if;

  /*
   * Ledger arithmetic must be valid before publishing
   * compatibility history.
   */
  if
    new.balance_before is null
    or new.balance_after is null
    or new.balance_after
         <> new.balance_before + new.points
  then
    raise exception
      'POINTS_REVIVE_HISTORY_LEDGER_ARITHMETIC_INVALID'
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
        'Mua Thẻ hồi sinh bằng điểm tích lũy',

      'source',
        'points_revive_credit_purchase_v1',

      'new_total',
        new.balance_after,

      'balance_before',
        new.balance_before,

      'transaction_type',
        new.transaction_type,

      'point_transaction_id',
        new.id,

      'purchase_id',
        v_purchase_id,

      'request_id',
        new.metadata ->> 'request_id',

      'quantity',
        new.metadata ->> 'quantity',

      'unit_price_vnd',
        new.metadata ->> 'unit_price_vnd',

      'unit_price_points',
        new.metadata ->> 'unit_price_points',

      'total_points',
        new.metadata ->> 'total_points'
    ),

    jsonb_build_object(
      'reference_type',
        'points_revive_credit_purchase',

      'reference_id',
        v_purchase_id,

      'point_transaction_id',
        new.id,

      'transaction_type',
        new.transaction_type,

      'source',
        'points_revive_credit_purchase_v1'
    ),

    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;


/* ----------------------------------------------------------
 * 3. Future canonical ledger projection.
 * ---------------------------------------------------------- */

drop trigger if exists
  project_points_revive_credit_history_v1
on public.point_transactions;

create trigger
  project_points_revive_credit_history_v1
after insert
on public.point_transactions
for each row
when (
  new.transaction_type = 'deduct'
  and new.points < 0
)
execute function
  public.project_points_revive_credit_history_v1();


/* ----------------------------------------------------------
 * 4. Historical canonical ledger backfill.
 *
 * analytics_events only.
 * Preserve authoritative point-ledger timestamp.
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
      'Mua Thẻ hồi sinh bằng điểm tích lũy',

    'source',
      'points_revive_credit_purchase_v1',

    'new_total',
      pt.balance_after,

    'balance_before',
      pt.balance_before,

    'transaction_type',
      pt.transaction_type,

    'point_transaction_id',
      pt.id,

    'purchase_id',
      pt.metadata ->> 'purchase_id',

    'request_id',
      pt.metadata ->> 'request_id',

    'quantity',
      pt.metadata ->> 'quantity',

    'unit_price_vnd',
      pt.metadata ->> 'unit_price_vnd',

    'unit_price_points',
      pt.metadata ->> 'unit_price_points',

    'total_points',
      pt.metadata ->> 'total_points'
  ),

  jsonb_build_object(
    'reference_type',
      'points_revive_credit_purchase',

    'reference_id',
      pt.metadata ->> 'purchase_id',

    'point_transaction_id',
      pt.id,

    'transaction_type',
      pt.transaction_type,

    'source',
      'points_revive_credit_purchase_v1'
  ),

  pt.created_at

from public.point_transactions pt

where
  pt.transaction_type = 'deduct'
  and
  pt.points < 0
  and
  pt.metadata ->> 'source' =
    'points_revive_credit_purchase_v1'
  and
  nullif(
    btrim(
      coalesce(
        pt.metadata ->> 'purchase_id',
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
      'points_revive_credit_purchase_v1'
    and
    (
      nullif(
        btrim(
          coalesce(
            pt.metadata ->> 'purchase_id',
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
      'POINTS_REVIVE_HISTORY_CANONICAL_LEDGER_INVALID'
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
      'points_revive_credit_purchase_v1'
    and not exists (
      select 1
      from public.analytics_events ae
      where
        ae.event_name =
          'points_deducted'
        and
        ae.metadata ->> 'reference_type' =
          'points_revive_credit_purchase'
        and
        ae.metadata ->> 'reference_id' =
          pt.metadata ->> 'purchase_id'
    );

  if v_missing <> 0 then
    raise exception
      'POINTS_REVIVE_HISTORY_PROJECTION_MISSING'
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
        as purchase_id,
      count(*) as row_count
    from public.analytics_events ae
    where
      ae.event_name =
        'points_deducted'
      and
      ae.metadata ->> 'reference_type' =
        'points_revive_credit_purchase'
    group by
      ae.metadata ->> 'reference_id'
    having count(*) <> 1
  ) d;

  if v_duplicate <> 0 then
    raise exception
      'POINTS_REVIVE_HISTORY_PROJECTION_DUPLICATE'
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
  public.project_points_revive_credit_history_v1()
from public;

revoke all
on function
  public.project_points_revive_credit_history_v1()
from anon;

revoke all
on function
  public.project_points_revive_credit_history_v1()
from authenticated;

revoke all
on function
  public.project_points_revive_credit_history_v1()
from service_role;
