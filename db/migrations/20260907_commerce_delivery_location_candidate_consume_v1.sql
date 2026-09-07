begin;


/*
 * ============================================================
 * CING COMMERCE DELIVERY LOCATION CANDIDATE CONSUME V1
 * ============================================================
 *
 * Purpose:
 *
 * - durable one-time replay fence for signed typed-address
 *   delivery candidate tokens
 *
 * Explicitly NOT owned here:
 *
 * - token signature verification
 * - token user verification
 * - geocoding
 * - shipping pricing
 * - payment creation
 * - Wallet mutation
 * - loyalty-point mutation
 *
 * Node verifies signed candidate V2 first.
 * PostgreSQL owns exactly-once consumption.
 */


create table if not exists
  public.cing_commerce_delivery_location_candidate_consumptions
(
  candidate_jti uuid primary key,

  user_id text not null,

  expires_at timestamptz not null,

  consumed_at timestamptz not null
    default clock_timestamp(),

  constraint
    cing_commerce_delivery_location_candidate_consumptions_user_id_ck
  check (
    btrim(user_id) <> ''
  )
);


create index if not exists
  cing_commerce_delivery_location_candidate_consumptions_expires_idx
on
  public.cing_commerce_delivery_location_candidate_consumptions
  (expires_at);


alter table
  public.cing_commerce_delivery_location_candidate_consumptions
enable row level security;


revoke all
on table
  public.cing_commerce_delivery_location_candidate_consumptions
from public;

revoke all
on table
  public.cing_commerce_delivery_location_candidate_consumptions
from anon;

revoke all
on table
  public.cing_commerce_delivery_location_candidate_consumptions
from authenticated;


/*
 * ============================================================
 * EXACTLY-ONCE CONSUME AUTHORITY
 * ============================================================
 *
 * First valid candidate_jti:
 *   consumed=true, replayed=false
 *
 * Every later call using the same jti:
 *   consumed=false, replayed=true
 *
 * No update path exists.
 * No financial state is touched.
 */
create or replace function
  public.cing_commerce_consume_delivery_location_candidate_v1(
    p_candidate_jti uuid,
    p_user_id text,
    p_expires_at timestamptz
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

  if
    p_candidate_jti is null
  then
    raise exception
      'DELIVERY_LOCATION_CANDIDATE_JTI_REQUIRED'
      using errcode = 'P0001';
  end if;

  if
    v_user_id is null
  then
    raise exception
      'DELIVERY_LOCATION_CANDIDATE_USER_REQUIRED'
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
      consumed_at
    )
  values
    (
      p_candidate_jti,
      v_user_id,
      p_expires_at,
      v_now
    )
  on conflict
    (candidate_jti)
  do nothing
  returning
    candidate_jti
  into
    v_inserted_jti;


  if
    v_inserted_jti is not null
  then
    return
      jsonb_build_object(
        'candidate_jti',
          p_candidate_jti,
        'user_id',
          v_user_id,
        'expires_at',
          p_expires_at,
        'consumed_at',
          v_now,
        'consumed',
          true,
        'replayed',
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


  if
    not found
  then
    raise exception
      'DELIVERY_LOCATION_CANDIDATE_REPLAY_STATE_MISSING'
      using errcode = 'P0001';
  end if;


  /*
   * Do not turn replay into idempotent success.
   *
   * A second checkout attempt must never be opened by the same
   * location capability, regardless of whether it comes from the
   * same authenticated user or a different one.
   */
  return
    jsonb_build_object(
      'candidate_jti',
        v_existing.candidate_jti,
      'user_id',
        v_existing.user_id,
      'expires_at',
        v_existing.expires_at,
      'consumed_at',
        v_existing.consumed_at,
      'consumed',
        false,
      'replayed',
        true
    );
end;
$$;


revoke all
on function
  public.cing_commerce_consume_delivery_location_candidate_v1(
    uuid,
    text,
    timestamptz
  )
from public;

revoke all
on function
  public.cing_commerce_consume_delivery_location_candidate_v1(
    uuid,
    text,
    timestamptz
  )
from anon;

revoke all
on function
  public.cing_commerce_consume_delivery_location_candidate_v1(
    uuid,
    text,
    timestamptz
  )
from authenticated;

grant execute
on function
  public.cing_commerce_consume_delivery_location_candidate_v1(
    uuid,
    text,
    timestamptz
  )
to service_role;


commit;
