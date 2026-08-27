begin;

/*
 * ==========================================================
 * CING COMMERCE — COMPLETION AUTHORITY V1
 * ==========================================================
 *
 * Establishes the durable database invariant:
 *
 *   one payment_transaction_id -> at most one commerce order
 *
 * Historical production repair:
 *
 * Payment 42 canonical order: 42
 * Payment 44 canonical order: 41
 *
 * Historical duplicate orders are preserved as order records.
 * Their former payment link is preserved in an immutable audit
 * table before payment_transaction_id is detached.
 *
 * NO order row is deleted.
 * NO iPOS log is deleted.
 * NO historical order code is rewritten.
 *
 * This migration intentionally fails closed if:
 * - canonical payment pointers changed,
 * - historical rows no longer match the audited anomaly,
 * - an active iPOS recovery job exists for a legacy duplicate,
 * - any unexpected duplicate payment link remains afterward.
 */


/*
 * ----------------------------------------------------------
 * 1. Durable repair audit
 * ----------------------------------------------------------
 */

create table if not exists
public.cing_commerce_order_payment_legacy_repair_audit (
  order_id bigint primary key,
  legacy_payment_transaction_id bigint not null,
  canonical_order_id bigint not null,
  repair_reason text not null,
  repaired_at timestamptz not null
    default clock_timestamp(),

  constraint
    cing_commerce_order_payment_legacy_repair_reason_v1
  check (
    repair_reason =
      'legacy_duplicate_payment_transaction_link_v1'
  ),

  constraint
    cing_commerce_order_payment_legacy_repair_not_self
  check (
    order_id <> canonical_order_id
  )
);

revoke all on table
public.cing_commerce_order_payment_legacy_repair_audit
from public;

revoke all on table
public.cing_commerce_order_payment_legacy_repair_audit
from anon;

revoke all on table
public.cing_commerce_order_payment_legacy_repair_audit
from authenticated;


/*
 * ----------------------------------------------------------
 * 2. Exact historical-shape assertions
 * ----------------------------------------------------------
 *
 * The repair is conditional so a fresh environment with no
 * May-2026 legacy rows can still apply this migration safely.
 *
 * But if any targeted historical row exists, the entire audited
 * shape must still be present exactly before mutation.
 */

do $audit$
declare
  v_target_row_count integer;
  v_active_recovery_count integer;
begin
  select count(*)
  into v_target_row_count
  from public.orders
  where id in (
    31, 32, 33, 34, 35,
    36, 37, 39, 40, 41, 42
  );

  if v_target_row_count > 0 then

    /*
     * All eleven audited historical orders must still exist.
     */
    if v_target_row_count <> 11 then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_TARGET_SET_CHANGED'
        using errcode = '55000';
    end if;


    /*
     * Payment 42 must still canonically own order 42.
     */
    if not exists (
      select 1
      from public.payment_transactions p
      where p.id = 42
        and p.order_id = 42
        and p.order_created is true
        and p.payment_status = 'paid'
        and p.payment_purpose = 'order'
    ) then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_PAYMENT_42_POINTER_CHANGED'
        using errcode = '55000';
    end if;


    /*
     * Payment 44 must still canonically own order 41.
     */
    if not exists (
      select 1
      from public.payment_transactions p
      where p.id = 44
        and p.order_id = 41
        and p.order_created is true
        and p.payment_status = 'paid'
        and p.payment_purpose = 'order'
    ) then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_PAYMENT_44_POINTER_CHANGED'
        using errcode = '55000';
    end if;


    /*
     * Canonical order rows themselves must still be linked.
     */
    if not exists (
      select 1
      from public.orders o
      where o.id = 42
        and o.payment_transaction_id = 42
        and o.status = 'confirmed'
        and o.status_code = 'confirmed'
        and o.payment_status = 'paid'
    ) then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_CANONICAL_ORDER_42_CHANGED'
        using errcode = '55000';
    end if;

    if not exists (
      select 1
      from public.orders o
      where o.id = 41
        and o.payment_transaction_id = 44
        and o.status = 'confirmed'
        and o.status_code = 'confirmed'
        and o.payment_status = 'paid'
    ) then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_CANONICAL_ORDER_41_CHANGED'
        using errcode = '55000';
    end if;


    /*
     * Exact nine non-canonical legacy rows must still have the
     * audited pending-payment shape.
     */
    if (
      select count(*)
      from public.orders o
      where (
        (
          o.id in (
            31, 32, 33, 34, 35,
            36, 37
          )
          and o.payment_transaction_id = 42
        )
        or
        (
          o.id in (
            39, 40
          )
          and o.payment_transaction_id = 44
        )
      )
        and o.status = 'pending_payment'
        and o.status_code = 'pending_payment'
        and o.payment_status = 'paid'
        and o.ipos_order_id is null
        and o.spending_synced is false
    ) <> 9 then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_NONCANONICAL_SHAPE_CHANGED'
        using errcode = '55000';
    end if;


    /*
     * A legacy duplicate must never be detached while an iPOS
     * recovery worker can still push it.
     */
    select count(*)
    into v_active_recovery_count
    from public.ipos_sync_queue q
    where q.order_numeric_id in (
      31, 32, 33, 34, 35,
      36, 37, 39, 40
    )
      and q.status in (
        'pending',
        'processing'
      );

    if v_active_recovery_count <> 0 then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_ACTIVE_IPOS_RECOVERY'
        using errcode = '55000';
    end if;

  end if;
end;
$audit$;


/*
 * ----------------------------------------------------------
 * 3. Preserve historical payment-link audit
 * ----------------------------------------------------------
 */

insert into
public.cing_commerce_order_payment_legacy_repair_audit (
  order_id,
  legacy_payment_transaction_id,
  canonical_order_id,
  repair_reason
)
select
  o.id,
  o.payment_transaction_id,
  case
    when o.payment_transaction_id = 42 then 42
    when o.payment_transaction_id = 44 then 41
  end,
  'legacy_duplicate_payment_transaction_link_v1'
from public.orders o
where (
  (
    o.id in (
      31, 32, 33, 34, 35,
      36, 37
    )
    and o.payment_transaction_id = 42
  )
  or
  (
    o.id in (
      39, 40
    )
    and o.payment_transaction_id = 44
  )
)
on conflict (order_id) do nothing;


/*
 * ----------------------------------------------------------
 * 4. Detach exactly the nine legacy duplicate links
 * ----------------------------------------------------------
 *
 * Preserve:
 * - orders
 * - order_code
 * - payment_status
 * - status history
 * - ipos_logs
 * - all other durable references
 */

update public.orders
set
  payment_transaction_id = null,
  updated_at = clock_timestamp()
where (
  (
    id in (
      31, 32, 33, 34, 35,
      36, 37
    )
    and payment_transaction_id = 42
  )
  or
  (
    id in (
      39, 40
    )
    and payment_transaction_id = 44
  )
);


/*
 * ----------------------------------------------------------
 * 5. Post-repair canonical assertions
 * ----------------------------------------------------------
 */

do $post_repair$
begin
  /*
   * If the historical production set exists, nine durable audit
   * records must now preserve the detached relationship.
   */
  if exists (
    select 1
    from public.orders
    where id in (
      31, 32, 33, 34, 35,
      36, 37, 39, 40, 41, 42
    )
  ) then
    if (
      select count(*)
      from public.cing_commerce_order_payment_legacy_repair_audit
      where order_id in (
        31, 32, 33, 34, 35,
        36, 37, 39, 40
      )
    ) <> 9 then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_AUDIT_INCOMPLETE'
        using errcode = '55000';
    end if;

    if (
      select count(*)
      from public.orders
      where id in (
        31, 32, 33, 34, 35,
        36, 37, 39, 40
      )
        and payment_transaction_id is null
    ) <> 9 then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_DETACH_INCOMPLETE'
        using errcode = '55000';
    end if;

    if not exists (
      select 1
      from public.orders
      where id = 42
        and payment_transaction_id = 42
    ) then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_CANONICAL_42_LOST'
        using errcode = '55000';
    end if;

    if not exists (
      select 1
      from public.orders
      where id = 41
        and payment_transaction_id = 44
    ) then
      raise exception
        'CING_COMMERCE_LEGACY_REPAIR_CANONICAL_44_LOST'
        using errcode = '55000';
    end if;
  end if;


  /*
   * No duplicate non-null payment link may remain anywhere,
   * not just in the historical repair set.
   */
  if exists (
    select 1
    from public.orders
    where payment_transaction_id is not null
    group by payment_transaction_id
    having count(*) > 1
  ) then
    raise exception
      'CING_COMMERCE_PAYMENT_ORDER_DUPLICATE_REMAINS'
      using errcode = '55000';
  end if;
end;
$post_repair$;


/*
 * ----------------------------------------------------------
 * 6. Durable one-payment -> at-most-one-order invariant
 * ----------------------------------------------------------
 */

create unique index if not exists
orders_payment_transaction_id_unique_v1
on public.orders (
  payment_transaction_id
)
where payment_transaction_id is not null;


/*
 * ----------------------------------------------------------
 * 7. Structural assertions
 * ----------------------------------------------------------
 */

do $structure$
begin
  if to_regclass(
    'public.cing_commerce_order_payment_legacy_repair_audit'
  ) is null then
    raise exception
      'CING_COMMERCE_LEGACY_REPAIR_AUDIT_TABLE_MISSING'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'orders'
      and indexname =
        'orders_payment_transaction_id_unique_v1'
      and indexdef ilike '%unique index%'
      and indexdef ilike '%payment_transaction_id%'
      and indexdef ilike '%where (payment_transaction_id is not null)%'
  ) then
    raise exception
      'CING_COMMERCE_PAYMENT_ORDER_UNIQUE_FENCE_MISSING'
      using errcode = '55000';
  end if;

  if has_table_privilege(
    'anon',
    'public.cing_commerce_order_payment_legacy_repair_audit',
    'SELECT'
  ) then
    raise exception
      'CING_COMMERCE_LEGACY_REPAIR_AUDIT_ANON_READ_FORBIDDEN'
      using errcode = '55000';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.cing_commerce_order_payment_legacy_repair_audit',
    'SELECT'
  ) then
    raise exception
      'CING_COMMERCE_LEGACY_REPAIR_AUDIT_AUTH_READ_FORBIDDEN'
      using errcode = '55000';
  end if;
end;
$structure$;

commit;
