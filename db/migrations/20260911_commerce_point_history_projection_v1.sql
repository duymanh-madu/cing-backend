begin;


/*
 * ==========================================================
 * CING COMMERCE POINT HISTORY PROJECTION V1
 * ==========================================================
 *
 * Authoritative source:
 *
 *   point_transactions
 *
 * Compatibility read model:
 *
 *   analytics_events
 *
 * Existing customer profile history reads analytics_events.
 *
 * This migration projects canonical Commerce point ledgers into
 * that read model.
 *
 * CRITICAL:
 *
 * - players.total_points MUST NOT be changed.
 * - point_transactions MUST NOT be changed.
 * - orders/payment_transactions MUST NOT be changed.
 * - iPOS MUST NOT be called.
 *
 * Projection identity:
 *
 *   event_name + commerce_order_id
 *
 * One Commerce order may legitimately contain:
 *
 *   points_deducted
 *   points_added
 *
 * but never two of the same event type.
 */


/* ----------------------------------------------------------
 * Fail closed if canonical Commerce history projections
 * already contain duplicates.
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
        'points_added',
        'points_deducted'
      )
      and
      ae.metadata ->> 'reference_type' =
        'commerce_order_points'
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
      'COMMERCE_POINT_HISTORY_EXISTING_DUPLICATES';
  end if;
end;
$migration$;


/* ----------------------------------------------------------
 * Durable projection uniqueness.
 * ---------------------------------------------------------- */

create unique index if not exists
  analytics_events_commerce_point_projection_uq
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
    'points_added',
    'points_deducted'
  )
  and
  metadata ->> 'reference_type' =
    'commerce_order_points'
  and
  nullif(
    metadata ->> 'reference_id',
    ''
  ) is not null;


/* ----------------------------------------------------------
 * Authoritative point ledger -> profile history projection.
 * ---------------------------------------------------------- */

create or replace function
public.project_commerce_point_history_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_name text;
  v_source text;
  v_order_code text;
begin
  if
    new.commerce_order_id is null
    or new.transaction_type not in (
      'add',
      'deduct'
    )
    or new.points = 0
  then
    return new;
  end if;

  /*
   * Ledger sign must agree with transaction type.
   * Fail closed instead of publishing contradictory history.
   */
  if
    (
      new.transaction_type = 'add'
      and new.points <= 0
    )
    or
    (
      new.transaction_type = 'deduct'
      and new.points >= 0
    )
  then
    raise exception
      'COMMERCE_POINT_HISTORY_LEDGER_SIGN_INVALID'
      using errcode = '55000';
  end if;

  v_event_name :=
    case
      when new.transaction_type = 'add'
        then 'points_added'
      else 'points_deducted'
    end;

  v_source :=
    coalesce(
      nullif(
        btrim(
          coalesce(
            new.metadata ->> 'source',
            ''
          )
        ),
        ''
      ),
      'commerce_order'
    );

  v_order_code :=
    nullif(
      btrim(
        coalesce(
          new.metadata ->> 'order_code',
          ''
        )
      ),
      ''
    );

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
    v_event_name,
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
          case
            when new.transaction_type = 'add'
              then 'Tích điểm đơn hàng'
            else 'Thanh toán đơn hàng bằng điểm'
          end
        ),
      'source',
        v_source,
      'new_total',
        new.balance_after,
      'balance_before',
        new.balance_before,
      'order_id',
        new.commerce_order_id,
      'order_code',
        v_order_code,
      'transaction_type',
        new.transaction_type,
      'point_transaction_id',
        new.id,
      'funding_source',
        new.metadata ->> 'funding_source',
      'effect_key',
        new.metadata ->> 'effect_key'
    ),
    jsonb_build_object(
      'reference_type',
        'commerce_order_points',
      'reference_id',
        new.commerce_order_id::text,
      'order_id',
        new.commerce_order_id,
      'point_transaction_id',
        new.id,
      'transaction_type',
        new.transaction_type
    ),
    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;


revoke all on function
  public.project_commerce_point_history_v1()
from public;

revoke all on function
  public.project_commerce_point_history_v1()
from anon;

revoke all on function
  public.project_commerce_point_history_v1()
from authenticated;


/* ----------------------------------------------------------
 * Ledger-bound trigger.
 *
 * Projection failure remains atomic with future canonical
 * Commerce ledger insert.
 * ---------------------------------------------------------- */

drop trigger if exists
  trg_commerce_point_history_v1
on public.point_transactions;

create trigger
  trg_commerce_point_history_v1
after insert
on public.point_transactions
for each row
when (
  new.commerce_order_id is not null
  and
  new.transaction_type in (
    'add',
    'deduct'
  )
  and
  new.points <> 0
)
execute function
  public.project_commerce_point_history_v1();


/* ----------------------------------------------------------
 * Historical canonical Commerce point-ledger backfill.
 *
 * IMPORTANT:
 *
 * - analytics_events only.
 * - preserve authoritative ledger timestamp.
 * - no financial mutation.
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

  case
    when pt.transaction_type = 'add'
      then 'points_added'
    else 'points_deducted'
  end,

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
        case
          when pt.transaction_type = 'add'
            then 'Tích điểm đơn hàng'
          else 'Thanh toán đơn hàng bằng điểm'
        end
      ),
    'source',
      coalesce(
        nullif(
          btrim(
            coalesce(
              pt.metadata ->> 'source',
              ''
            )
          ),
          ''
        ),
        'commerce_order'
      ),
    'new_total',
      pt.balance_after,
    'balance_before',
      pt.balance_before,
    'order_id',
      pt.commerce_order_id,
    'order_code',
      nullif(
        btrim(
          coalesce(
            pt.metadata ->> 'order_code',
            ''
          )
        ),
        ''
      ),
    'transaction_type',
      pt.transaction_type,
    'point_transaction_id',
      pt.id,
    'funding_source',
      pt.metadata ->> 'funding_source',
    'effect_key',
      pt.metadata ->> 'effect_key'
  ),

  jsonb_build_object(
    'reference_type',
      'commerce_order_points',
    'reference_id',
      pt.commerce_order_id::text,
    'order_id',
      pt.commerce_order_id,
    'point_transaction_id',
      pt.id,
    'transaction_type',
      pt.transaction_type
  ),

  pt.created_at

from public.point_transactions pt
where
  pt.commerce_order_id is not null
  and
  (
    (
      pt.transaction_type = 'add'
      and pt.points > 0
    )
    or
    (
      pt.transaction_type = 'deduct'
      and pt.points < 0
    )
  )
on conflict do nothing;


/* ----------------------------------------------------------
 * Postconditions.
 *
 * Every canonical Commerce point ledger must have exactly one
 * corresponding profile-history projection.
 * ---------------------------------------------------------- */

do $migration$
declare
  v_missing bigint;
  v_duplicate bigint;
begin

  select count(*)
  into v_missing
  from public.point_transactions pt
  where
    pt.commerce_order_id is not null
    and
    (
      (
        pt.transaction_type = 'add'
        and pt.points > 0
      )
      or
      (
        pt.transaction_type = 'deduct'
        and pt.points < 0
      )
    )
    and not exists (
      select 1
      from public.analytics_events ae
      where
        ae.event_name =
          case
            when pt.transaction_type = 'add'
              then 'points_added'
            else 'points_deducted'
          end
        and
        ae.metadata ->> 'reference_type' =
          'commerce_order_points'
        and
        ae.metadata ->> 'reference_id' =
          pt.commerce_order_id::text
    );

  if v_missing <> 0 then
    raise exception
      'COMMERCE_POINT_HISTORY_BACKFILL_INCOMPLETE';
  end if;


  select count(*)
  into v_duplicate
  from (
    select
      ae.event_name,
      ae.metadata ->> 'reference_id'
    from public.analytics_events ae
    where
      ae.event_name in (
        'points_added',
        'points_deducted'
      )
      and
      ae.metadata ->> 'reference_type' =
        'commerce_order_points'
    group by
      ae.event_name,
      ae.metadata ->> 'reference_id'
    having count(*) <> 1
  ) duplicates;

  if v_duplicate <> 0 then
    raise exception
      'COMMERCE_POINT_HISTORY_DUPLICATE';
  end if;

end;
$migration$;


commit;
