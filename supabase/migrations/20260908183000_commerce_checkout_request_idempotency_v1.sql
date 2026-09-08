begin;


/*
 * ============================================================
 * CING COMMERCE CHECKOUT REQUEST IDEMPOTENCY V1
 * ============================================================
 *
 * One logical checkout intent owns one checkout_request_id.
 *
 * Same authenticated user + same checkout_request_id:
 *
 * - same canonical fingerprint => exact payment replay
 * - different fingerprint      => conflict
 *
 * Delivery candidate consumption is additionally bound to the
 * same checkout request so retrying one logical checkout does not
 * burn the location capability.
 *
 * No financial mutation is performed by candidate consumption.
 */


alter table
  public.payment_transactions
add column if not exists
  checkout_request_id uuid;


alter table
  public.payment_transactions
add column if not exists
  checkout_fingerprint text;


create unique index if not exists
  payment_transactions_order_checkout_request_uq
on
  public.payment_transactions
  (
    user_id,
    checkout_request_id
  )
where
  payment_purpose = 'order'
  and checkout_request_id is not null;


create index if not exists
  payment_transactions_checkout_request_idx
on
  public.payment_transactions
  (checkout_request_id)
where
  checkout_request_id is not null;


/*
 * Existing candidate consumptions pre-date request binding.
 *
 * NULL therefore means "legacy consumed capability". Such a row
 * remains non-replayable. Only V2 consumptions receive a request ID.
 */
alter table
  public.cing_commerce_delivery_location_candidate_consumptions
add column if not exists
  checkout_request_id uuid;


create index if not exists
  cing_commerce_delivery_candidate_checkout_request_idx
on
  public.cing_commerce_delivery_location_candidate_consumptions
  (checkout_request_id)
where
  checkout_request_id is not null;


/*
 * ============================================================
 * REQUEST-BOUND CANDIDATE CONSUME V2
 * ============================================================
 *
 * First candidate_jti + request:
 *   consumed=true, replayed=false, idempotent=false
 *
 * Same candidate_jti + same user + same request:
 *   consumed=true, replayed=true, idempotent=true
 *
 * Same candidate_jti + another request:
 *   consumed=false, replayed=true, idempotent=false
 *
 * Legacy row without checkout_request_id:
 *   remains replay-blocked.
 */
create or replace function
  public.cing_commerce_consume_delivery_location_candidate_v2(
    p_candidate_jti uuid,
    p_user_id text,
    p_expires_at timestamptz,
    p_checkout_request_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;

  v_inserted_jti uuid;

  v_existing
    public.cing_commerce_delivery_location_candidate_consumptions%rowtype;

  v_now timestamptz;
begin
  v_now :=
    clock_timestamp();

  v_user_id :=
    nullif(
      btrim(
        coalesce(
          p_user_id,
          ''
        )
      ),
      ''
    );

  if p_candidate_jti is null then
    raise exception
      'DELIVERY_LOCATION_CANDIDATE_JTI_REQUIRED'
      using errcode = 'P0001';
  end if;

  if v_user_id is null then
    raise exception
      'DELIVERY_LOCATION_CANDIDATE_USER_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_checkout_request_id is null then
    raise exception
      'COMMERCE_CHECKOUT_REQUEST_ID_REQUIRED'
      using errcode = 'P0001';
  end if;

  if
    p_expires_at is null
    or
    p_expires_at < v_now
  then
    raise exception
      'DELIVERY_LOCATION_CANDIDATE_EXPIRED'
      using errcode = 'P0001';
  end if;


  insert into
    public.cing_commerce_delivery_location_candidate_consumptions
    (
      candidate_jti,
      user_id,
      expires_at,
      consumed_at,
      checkout_request_id
    )
  values
    (
      p_candidate_jti,
      v_user_id,
      p_expires_at,
      v_now,
      p_checkout_request_id
    )
  on conflict
    (candidate_jti)
  do nothing
  returning
    candidate_jti
  into
    v_inserted_jti;


  if v_inserted_jti is not null then
    return
      jsonb_build_object(
        'candidate_jti',
          p_candidate_jti,
        'user_id',
          v_user_id,
        'checkout_request_id',
          p_checkout_request_id,
        'expires_at',
          p_expires_at,
        'consumed_at',
          v_now,
        'consumed',
          true,
        'replayed',
          false,
        'idempotent',
          false
      );
  end if;


  select
    *
  into
    v_existing
  from
    public.cing_commerce_delivery_location_candidate_consumptions
  where
    candidate_jti =
      p_candidate_jti;


  if not found then
    raise exception
      'DELIVERY_LOCATION_CANDIDATE_REPLAY_STATE_MISSING'
      using errcode = 'P0001';
  end if;


  /*
   * User binding remains immutable.
   */
  if
    v_existing.user_id <>
    v_user_id
  then
    return
      jsonb_build_object(
        'candidate_jti',
          v_existing.candidate_jti,
        'user_id',
          v_existing.user_id,
        'checkout_request_id',
          v_existing.checkout_request_id,
        'expires_at',
          v_existing.expires_at,
        'consumed_at',
          v_existing.consumed_at,
        'consumed',
          false,
        'replayed',
          true,
        'idempotent',
          false
      );
  end if;


  /*
   * Exact retry of the same logical checkout.
   */
  if
    v_existing.checkout_request_id is not null
    and
    v_existing.checkout_request_id =
      p_checkout_request_id
  then
    return
      jsonb_build_object(
        'candidate_jti',
          v_existing.candidate_jti,
        'user_id',
          v_existing.user_id,
        'checkout_request_id',
          v_existing.checkout_request_id,
        'expires_at',
          v_existing.expires_at,
        'consumed_at',
          v_existing.consumed_at,
        'consumed',
          true,
        'replayed',
          true,
        'idempotent',
          true
      );
  end if;


  /*
   * Different checkout request, or legacy consumption with no
   * request identity: replay stays blocked.
   */
  return
    jsonb_build_object(
      'candidate_jti',
        v_existing.candidate_jti,
      'user_id',
        v_existing.user_id,
      'checkout_request_id',
        v_existing.checkout_request_id,
      'expires_at',
        v_existing.expires_at,
      'consumed_at',
        v_existing.consumed_at,
      'consumed',
        false,
      'replayed',
        true,
      'idempotent',
        false
    );
end;
$$;


revoke all
on function
  public.cing_commerce_consume_delivery_location_candidate_v2(
    uuid,
    text,
    timestamptz,
    uuid
  )
from public;

revoke all
on function
  public.cing_commerce_consume_delivery_location_candidate_v2(
    uuid,
    text,
    timestamptz,
    uuid
  )
from anon;

revoke all
on function
  public.cing_commerce_consume_delivery_location_candidate_v2(
    uuid,
    text,
    timestamptz,
    uuid
  )
from authenticated;

grant execute
on function
  public.cing_commerce_consume_delivery_location_candidate_v2(
    uuid,
    text,
    timestamptz,
    uuid
  )
to service_role;


commit;
