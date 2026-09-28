/*
 * ============================================================
 * CING GAME CENTER V2
 * GIFT IPOS DELIVERY AUTHORITY V1
 * ============================================================
 *
 * Delivery-state authority only.
 *
 * No Wallet balance mutation.
 * No loyalty balance mutation.
 * No Charm balance mutation.
 * No Gift funding ledger mutation.
 * No catalog mutation.
 *
 * service_role retains SELECT-only table access.
 * Exactly five delivery RPCs are explicitly executable
 * by service_role.
 *
 * Customer roles receive no delivery RPC permission.
 *
 * This migration does not activate Gift purchase RPCs,
 * Gift Admin RPCs or any application feature flag.
 * ============================================================
 */

begin;

/*
 * ============================================================
 * 1. RELEASE EXPIRED DELIVERY LEASES
 * ============================================================
 */

create function
public.cing_game_gift_ipos_release_stuck_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  update public.cing_game_gift_purchases
  set
    ipos_sync_status = 'pending',
    ipos_locked_until = null,
    updated_at = clock_timestamp()
  where
    funding_source = 'points'
    and ipos_sync_status = 'processing'
    and ipos_locked_until < clock_timestamp();

  get diagnostics
    v_count = row_count;

  return v_count;
end;
$function$;


/*
 * ============================================================
 * 2. ATOMIC BOUNDED CLAIM
 * ============================================================
 *
 * FOR UPDATE SKIP LOCKED prevents competing workers
 * from selecting the same eligible pending purchase.
 *
 * The returned lease is the ownership fence for the
 * remaining delivery RPCs.
 */

create function
public.cing_game_gift_ipos_claim_pending_v1(
  p_batch_size integer
)
returns setof public.cing_game_gift_purchases
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if
    p_batch_size is null
    or p_batch_size < 1
    or p_batch_size > 100
  then
    raise exception
      'game_gift_batch_size_invalid';
  end if;

  return query

  with selected as (
    select g.id
    from public.cing_game_gift_purchases g
    where
      g.funding_source = 'points'
      and g.ipos_sync_status = 'pending'
      and g.ipos_next_retry_at <= clock_timestamp()
    order by
      g.created_at asc,
      g.id asc
    limit p_batch_size
    for update skip locked
  )

  update public.cing_game_gift_purchases g
  set
    ipos_sync_status = 'processing',
    ipos_locked_until =
      clock_timestamp() + interval '10 minutes',
    updated_at = clock_timestamp()
  from selected s
  where g.id = s.id
  returning g.*;

end;
$function$;


/*
 * ============================================================
 * 3. DURABLE SINGLE-SEND AUTHORITY
 * ============================================================
 *
 * NULL -> timestamp is the only transition that
 * grants permission to send iPOS MINUS.
 *
 * A timeout, process crash or retry must never reset
 * ipos_first_attempt_at.
 *
 * A competing worker cannot inherit another lease.
 */

create function
public.cing_game_gift_ipos_first_attempt_v1(
  p_purchase_id uuid,
  p_locked_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.cing_game_gift_purchases%rowtype;
begin
  if
    p_purchase_id is null
    or p_locked_until is null
  then
    raise exception
      'game_gift_first_attempt_input_invalid';
  end if;

  update public.cing_game_gift_purchases g
  set
    ipos_first_attempt_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where
    g.id = p_purchase_id
    and g.funding_source = 'points'
    and g.ipos_sync_status = 'processing'
    and g.ipos_locked_until = p_locked_until
    and g.ipos_locked_until > clock_timestamp()
    and g.ipos_first_attempt_at is null
  returning g.*
  into v_row;

  if found then
    return jsonb_build_object(
      'row', to_jsonb(v_row),
      'send_allowed', true
    );
  end if;

  select g.*
  into v_row
  from public.cing_game_gift_purchases g
  where
    g.id = p_purchase_id
    and g.funding_source = 'points'
    and g.ipos_sync_status = 'processing'
    and g.ipos_locked_until = p_locked_until
    and g.ipos_locked_until > clock_timestamp();

  if not found then
    raise exception
      'game_gift_first_attempt_lease_lost';
  end if;

  if v_row.ipos_first_attempt_at is null then
    raise exception
      'game_gift_first_attempt_unconfirmed';
  end if;

  return jsonb_build_object(
    'row', to_jsonb(v_row),
    'send_allowed', false
  );
end;
$function$;


/*
 * ============================================================
 * 4. MARK VERIFIED IPOS DELIVERY
 * ============================================================
 *
 * The backend must verify the immutable iPOS marker
 * before calling this RPC.
 *
 * The SQL authority additionally requires an active
 * matching lease.
 */

create function
public.cing_game_gift_ipos_mark_synced_v1(
  p_purchase_id uuid,
  p_locked_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if
    p_purchase_id is null
    or p_locked_until is null
  then
    raise exception
      'game_gift_mark_synced_input_invalid';
  end if;

  update public.cing_game_gift_purchases g
  set
    ipos_sync_status = 'synced',
    ipos_synced_at = clock_timestamp(),
    ipos_locked_until = null,
    ipos_last_error = null,
    updated_at = clock_timestamp()
  where
    g.id = p_purchase_id
    and g.funding_source = 'points'
    and g.ipos_sync_status = 'processing'
    and g.ipos_locked_until = p_locked_until
    and g.ipos_locked_until > clock_timestamp()
  returning g.id
  into v_id;

  if v_id is null then
    raise exception
      'game_gift_mark_synced_failed';
  end if;

  return true;
end;
$function$;


/*
 * ============================================================
 * 5. FAILURE + EXISTING RETRY POLICY
 * ============================================================
 *
 * Retry minutes:
 * 1 / 5 / 15 / 60 / 360 / 1440
 *
 * Maximum failed attempts: 6.
 *
 * This function never clears the durable
 * ipos_first_attempt_at fence.
 */

create function
public.cing_game_gift_ipos_mark_failed_v1(
  p_purchase_id uuid,
  p_locked_until timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.cing_game_gift_purchases%rowtype;
  v_next_count integer;
  v_terminal boolean;
  v_retry_minutes integer;
  v_now timestamptz;
begin
  if
    p_purchase_id is null
    or p_locked_until is null
  then
    raise exception
      'game_gift_mark_failed_input_invalid';
  end if;

  /*
   * Lock the exact lease owner before calculating
   * the next retry count.
   */

  select g.*
  into v_row
  from public.cing_game_gift_purchases g
  where
    g.id = p_purchase_id
    and g.funding_source = 'points'
    and g.ipos_sync_status = 'processing'
    and g.ipos_locked_until = p_locked_until
    and g.ipos_locked_until > clock_timestamp()
  for update;

  if not found then
    raise exception
      'game_gift_mark_failed_lease_lost';
  end if;

  v_next_count =
    v_row.ipos_retry_count + 1;

  v_terminal =
    v_next_count >= 6;

  v_retry_minutes =
    case
      when v_next_count <= 1 then 1
      when v_next_count = 2 then 5
      when v_next_count = 3 then 15
      when v_next_count = 4 then 60
      when v_next_count = 5 then 360
      else 1440
    end;

  v_now = clock_timestamp();

  update public.cing_game_gift_purchases g
  set
    ipos_sync_status =
      case
        when v_terminal then 'failed'
        else 'pending'
      end,

    ipos_retry_count =
      v_next_count,

    ipos_last_error =
      left(
        coalesce(p_reason, ''),
        1000
      ),

    ipos_next_retry_at =
      case
        when v_terminal then v_now
        else
          v_now
          + make_interval(
              mins => v_retry_minutes
            )
      end,

    ipos_locked_until = null,
    updated_at = v_now
  where
    g.id = p_purchase_id
    and g.funding_source = 'points'
    and g.ipos_sync_status = 'processing'
    and g.ipos_locked_until = p_locked_until
  returning g.*
  into v_row;

  if not found then
    raise exception
      'game_gift_mark_failed_update_failed';
  end if;

  return jsonb_build_object(
    'retry_count',
      v_row.ipos_retry_count,

    'terminal',
      v_terminal,

    'status',
      v_row.ipos_sync_status,

    'next_retry_at',
      v_row.ipos_next_retry_at
  );

end;
$function$;


/*
 * ============================================================
 * 6. EXPLICIT EXECUTION AUTHORITY
 * ============================================================
 *
 * No direct UPDATE grant on Gift purchases.
 */

revoke all
on function
public.cing_game_gift_ipos_release_stuck_v1()
from public, anon, authenticated, service_role;

revoke all
on function
public.cing_game_gift_ipos_claim_pending_v1(
  integer
)
from public, anon, authenticated, service_role;

revoke all
on function
public.cing_game_gift_ipos_first_attempt_v1(
  uuid,
  timestamptz
)
from public, anon, authenticated, service_role;

revoke all
on function
public.cing_game_gift_ipos_mark_synced_v1(
  uuid,
  timestamptz
)
from public, anon, authenticated, service_role;

revoke all
on function
public.cing_game_gift_ipos_mark_failed_v1(
  uuid,
  timestamptz,
  text
)
from public, anon, authenticated, service_role;


/*
 * Backend service_role only.
 */

grant execute
on function
public.cing_game_gift_ipos_release_stuck_v1()
to service_role;

grant execute
on function
public.cing_game_gift_ipos_claim_pending_v1(
  integer
)
to service_role;

grant execute
on function
public.cing_game_gift_ipos_first_attempt_v1(
  uuid,
  timestamptz
)
to service_role;

grant execute
on function
public.cing_game_gift_ipos_mark_synced_v1(
  uuid,
  timestamptz
)
to service_role;

grant execute
on function
public.cing_game_gift_ipos_mark_failed_v1(
  uuid,
  timestamptz,
  text
)
to service_role;

commit;
