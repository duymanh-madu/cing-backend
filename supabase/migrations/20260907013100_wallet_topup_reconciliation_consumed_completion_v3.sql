begin;

/*
 * =====================================================
 * CING WALLET — CONSUMED RECONCILIATION COMPLETION V3
 * =====================================================
 *
 * A provider callback may verify and atomically consume
 * Wallet settlement before the reconciliation worker's
 * grace window expires.
 *
 * V2 excluded every consumed payment from claim
 * candidates, leaving its already-created durable job
 * permanently pending.
 *
 * V3 permits an already-consumed payment to be claimed
 * only when success is already fully durable:
 *
 * - payment_status = paid
 * - settlement_verified_at is present
 * - settlement_consumed_at is present
 *
 * The worker then closes the reconciliation job without
 * invoking Wallet settlement again.
 */

create or replace function
public.cing_payment_claim_wallet_topup_reconciliation_v2(
  p_batch_size integer default 20,
  p_lease_seconds integer default 120,
  p_grace_seconds integer default 45,
  p_allow_momo boolean default false,
  p_allow_zalo_checkout boolean default false
)
returns table (
  payment_transaction_id bigint,
  transaction_code text,
  payment_provider text,
  payment_status text,
  amount numeric,
  provider_transaction_id text,
  settlement_verified_at timestamptz,
  settlement_verification_method text,
  settlement_reference text,
  settlement_consumed_at timestamptz,
  attempt_count integer,
  claim_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();
begin
  if p_batch_size is null
     or p_batch_size < 1
     or p_batch_size > 100
  then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_BATCH_INVALID'
      using errcode = '22023';
  end if;

  if p_lease_seconds is null
     or p_lease_seconds < 30
     or p_lease_seconds > 3600
  then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_LEASE_INVALID'
      using errcode = '22023';
  end if;

  if p_grace_seconds is null
     or p_grace_seconds < 0
     or p_grace_seconds > 3600
  then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_GRACE_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Safety-net enrollment remains provider-neutral.
   */
  insert into public.payment_reconciliation_jobs (
    payment_transaction_id
  )
  select p.id
  from public.payment_transactions p
  where p.payment_purpose =
      'wallet_topup'
    and lower(
      btrim(
        coalesce(
          p.payment_provider,
          ''
        )
      )
    ) in (
      'momo',
      'zalo_checkout'
    )
    and p.payment_status in (
      'pending',
      'paid'
    )
    and (
      p.settlement_consumed_at
        is null
      or (
        p.payment_status =
          'paid'
        and p.settlement_verified_at
          is not null
        and p.settlement_consumed_at
          is not null
      )
    )
  on conflict on constraint
    payment_reconciliation_jobs_pkey
  do nothing;

  return query
  with candidates as (
    select
      j.payment_transaction_id
    from public.payment_reconciliation_jobs j
    join public.payment_transactions p
      on p.id =
        j.payment_transaction_id
    where p.payment_purpose =
        'wallet_topup'
      and (
        (
          p_allow_momo
          and lower(
            btrim(
              coalesce(
                p.payment_provider,
                ''
              )
            )
          ) = 'momo'
        )
        or
        (
          p_allow_zalo_checkout
          and lower(
            btrim(
              coalesce(
                p.payment_provider,
                ''
              )
            )
          ) = 'zalo_checkout'
        )
      )
      and p.payment_status in (
        'pending',
        'paid'
      )
      and (
        p.settlement_consumed_at
          is null
        or (
          p.payment_status =
            'paid'
          and p.settlement_verified_at
            is not null
          and p.settlement_consumed_at
            is not null
        )
      )
      and p.created_at <=
        v_now -
        make_interval(
          secs =>
            p_grace_seconds
        )
      and j.next_attempt_at <=
        v_now
      and (
        j.status in (
          'pending',
          'retry'
        )
        or (
          j.status =
            'processing'
          and j.lease_expires_at <=
            v_now
        )
      )
    order by
      j.next_attempt_at,
      j.payment_transaction_id
    for update of j
      skip locked
    limit p_batch_size
  ),
  claimed as (
    update public.payment_reconciliation_jobs j
    set
      status =
        'processing',
      attempt_count =
        j.attempt_count + 1,
      claim_token =
        gen_random_uuid(),
      claimed_at =
        v_now,
      lease_expires_at =
        v_now +
        make_interval(
          secs =>
            p_lease_seconds
        ),
      last_error =
        null,
      updated_at =
        v_now
    from candidates c
    where j.payment_transaction_id =
      c.payment_transaction_id
    returning j.*
  )
  select
    p.id,
    p.transaction_code,
    p.payment_provider,
    p.payment_status,
    p.amount,
    p.provider_transaction_id,
    p.settlement_verified_at,
    p.settlement_verification_method,
    p.settlement_reference,
    p.settlement_consumed_at,
    c.attempt_count,
    c.claim_token
  from claimed c
  join public.payment_transactions p
    on p.id =
      c.payment_transaction_id;
end;
$$;

revoke all on function
public.cing_payment_claim_wallet_topup_reconciliation_v2(
  integer,
  integer,
  integer,
  boolean,
  boolean
)
from public, anon, authenticated;

grant execute on function
public.cing_payment_claim_wallet_topup_reconciliation_v2(
  integer,
  integer,
  integer,
  boolean,
  boolean
)
to service_role;

commit;
