begin;

/*
 * ==========================================================
 * CING WALLET — DURABLE TOP-UP RECONCILIATION AUTHORITY V2
 * ==========================================================
 *
 * V2 extends the existing durable job table to:
 *
 * - retain legacy MoMo reconciliation
 * - reconcile new Zalo Checkout top-ups
 * - claim only provider entitlements enabled by the worker
 * - bind provider query proof inside PostgreSQL
 * - preserve lease/fencing and exactly-once Wallet settlement
 *
 * Existing V1 functions remain for historical compatibility.
 */


/*
 * ----------------------------------------------------------
 * V2 ensure primitive.
 * ----------------------------------------------------------
 */

create or replace function
public.cing_payment_ensure_wallet_topup_reconciliation_v2(
  p_payment_transaction_id bigint
)
returns public.payment_reconciliation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_job public.payment_reconciliation_jobs%rowtype;
begin
  select *
  into v_payment
  from public.payment_transactions
  where id = p_payment_transaction_id;

  if not found then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_payment.payment_purpose <> 'wallet_topup'
     or lower(
       btrim(
         coalesce(
           v_payment.payment_provider,
           ''
         )
       )
     ) not in (
       'momo',
       'zalo_checkout'
     )
  then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_PAYMENT_INELIGIBLE'
      using errcode = '22023';
  end if;

  insert into public.payment_reconciliation_jobs (
    payment_transaction_id
  )
  values (
    v_payment.id
  )
  on conflict (payment_transaction_id)
  do nothing;

  select *
  into v_job
  from public.payment_reconciliation_jobs
  where payment_transaction_id =
    v_payment.id;

  return v_job;
end;
$$;


/*
 * ----------------------------------------------------------
 * Replace automatic enrollment with V2 dual-provider guard.
 * ----------------------------------------------------------
 */

create or replace function
public.cing_payment_wallet_topup_reconciliation_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_purpose = 'wallet_topup'
     and lower(
       btrim(
         coalesce(
           new.payment_provider,
           ''
         )
       )
     ) in (
       'momo',
       'zalo_checkout'
     )
  then
    perform
      public.cing_payment_ensure_wallet_topup_reconciliation_v2(
        new.id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists
payment_wallet_topup_reconciliation_enroll_v1
on public.payment_transactions;

drop trigger if exists
payment_wallet_topup_reconciliation_enroll_v2
on public.payment_transactions;

create trigger
payment_wallet_topup_reconciliation_enroll_v2
after insert or update of
  payment_purpose,
  payment_provider
on public.payment_transactions
for each row
execute function
public.cing_payment_wallet_topup_reconciliation_trigger_v2();


/*
 * Backfill unresolved rows for either provider.
 *
 * This preserves payment 298 and any earlier MoMo row while
 * allowing Zalo Checkout rows to enter the same durable table.
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
  and p.settlement_consumed_at
    is null
  and p.payment_status in (
    'pending',
    'paid'
  )
on conflict (payment_transaction_id)
do nothing;


/*
 * ----------------------------------------------------------
 * V2 claim authority.
 *
 * Provider entitlements are supplied by trusted backend
 * runtime configuration. Disabled providers cannot be claimed.
 * ----------------------------------------------------------
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
    and p.settlement_consumed_at
      is null
    and p.payment_status in (
      'pending',
      'paid'
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
      and p.settlement_consumed_at
        is null
      and p.payment_status in (
        'pending',
        'paid'
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


/*
 * ----------------------------------------------------------
 * Accept Zalo Checkout getOrderStatus success.
 * ----------------------------------------------------------
 */

create or replace function
public.cing_payment_accept_zalo_checkout_query_success_v2(
  p_payment_transaction_id bigint,
  p_claim_token uuid,
  p_provider_transaction_id text,
  p_provider_amount bigint
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_job public.payment_reconciliation_jobs%rowtype;
  v_now timestamptz :=
    clock_timestamp();
begin
  if p_claim_token is null then
    raise exception
      'ZALO_CHECKOUT_QUERY_CLAIM_TOKEN_REQUIRED'
      using errcode = '22023';
  end if;

  if p_provider_transaction_id is null
     or btrim(
       p_provider_transaction_id
     ) = ''
  then
    raise exception
      'ZALO_CHECKOUT_QUERY_PROVIDER_TRANSACTION_REQUIRED'
      using errcode = '22023';
  end if;

  if p_provider_amount is null
     or p_provider_amount <= 0
  then
    raise exception
      'ZALO_CHECKOUT_QUERY_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  select *
  into v_job
  from public.payment_reconciliation_jobs
  where payment_transaction_id =
    p_payment_transaction_id
  for update;

  if not found
     or v_job.status <>
       'processing'
     or v_job.claim_token
       is distinct from
         p_claim_token
     or v_job.lease_expires_at <=
       v_now
  then
    raise exception
      'ZALO_CHECKOUT_QUERY_RECONCILIATION_CLAIM_INVALID'
      using errcode = '55000';
  end if;

  select *
  into v_payment
  from public.payment_transactions
  where id =
    p_payment_transaction_id
  for update;

  if not found then
    raise exception
      'ZALO_CHECKOUT_QUERY_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_payment.payment_purpose <>
       'wallet_topup'
     or lower(
       btrim(
         coalesce(
           v_payment.payment_provider,
           ''
         )
       )
     ) <> 'zalo_checkout'
  then
    raise exception
      'ZALO_CHECKOUT_QUERY_PAYMENT_AUTHORITY_INVALID'
      using errcode = '22023';
  end if;

  if v_payment.amount is null
     or v_payment.amount <>
       trunc(
         v_payment.amount
       )
     or v_payment.amount::bigint <>
       p_provider_amount
  then
    raise exception
      'ZALO_CHECKOUT_QUERY_PAYMENT_AMOUNT_MISMATCH'
      using errcode = '55000';
  end if;

  /*
   * Callback/query race.
   */
  if v_payment.settlement_verified_at
       is not null
  then
    if v_payment.payment_status <>
         'paid'
       or v_payment.settlement_reference
         is distinct from
           btrim(
             p_provider_transaction_id
           )
    then
      raise exception
        'ZALO_CHECKOUT_QUERY_EXISTING_SETTLEMENT_CONFLICT'
        using errcode = '55000';
    end if;

    return v_payment;
  end if;

  if v_payment.payment_status <>
       'pending'
  then
    raise exception
      'ZALO_CHECKOUT_QUERY_PAYMENT_STATUS_INVALID'
      using errcode = '55000';
  end if;

  update public.payment_transactions
  set
    payment_status =
      'paid',
    provider_transaction_id =
      btrim(
        p_provider_transaction_id
      ),
    paid_at =
      coalesce(
        paid_at,
        v_now
      ),
    settlement_verified_at =
      v_now,
    settlement_verification_method =
      'zalo_checkout_status_query_v2',
    settlement_reference =
      btrim(
        p_provider_transaction_id
      ),
    failure_reason =
      null,
    updated_at =
      v_now
  where id =
    v_payment.id
  returning *
  into v_payment;

  return v_payment;
end;
$$;


/*
 * ----------------------------------------------------------
 * V2 provider-neutral terminal failure.
 * ----------------------------------------------------------
 */

create or replace function
public.cing_payment_terminal_fail_wallet_topup_reconciliation_v2(
  p_payment_transaction_id bigint,
  p_claim_token uuid,
  p_result_code integer,
  p_provider_transaction_id text default null,
  p_error text default null
)
returns public.payment_reconciliation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.payment_reconciliation_jobs%rowtype;
  v_payment public.payment_transactions%rowtype;
  v_now timestamptz :=
    clock_timestamp();
begin
  if p_result_code is null then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_RESULT_CODE_REQUIRED'
      using errcode = '22023';
  end if;

  select *
  into v_job
  from public.payment_reconciliation_jobs
  where payment_transaction_id =
    p_payment_transaction_id
  for update;

  if not found
     or v_job.status <>
       'processing'
     or v_job.claim_token
       is distinct from
         p_claim_token
     or v_job.lease_expires_at <=
       v_now
  then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_CLAIM_INVALID'
      using errcode = '55000';
  end if;

  select *
  into v_payment
  from public.payment_transactions
  where id =
    p_payment_transaction_id
  for update;

  if not found then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_payment.payment_purpose <>
       'wallet_topup'
     or lower(
       btrim(
         coalesce(
           v_payment.payment_provider,
           ''
         )
       )
     ) not in (
       'momo',
       'zalo_checkout'
     )
  then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_PAYMENT_AUTHORITY_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Stale failure can never downgrade success.
   */
  if v_payment.settlement_verified_at
       is not null
     or v_payment.settlement_consumed_at
       is not null
     or v_payment.payment_status =
       'paid'
  then
    raise exception
      'WALLET_TOPUP_RECONCILIATION_SUCCESS_ALREADY_DURABLE'
      using errcode = '55000';
  end if;

  update public.payment_transactions
  set
    payment_status =
      'failed',
    provider_transaction_id =
      coalesce(
        nullif(
          btrim(
            p_provider_transaction_id
          ),
          ''
        ),
        provider_transaction_id
      ),
    failure_reason =
      left(
        coalesce(
          nullif(
            btrim(
              p_error
            ),
            ''
          ),
          'Provider terminal resultCode ' ||
          p_result_code::text
        ),
        4000
      ),
    updated_at =
      v_now
  where id =
    v_payment.id;

  update public.payment_reconciliation_jobs
  set
    status =
      'terminal_failed',
    claim_token =
      null,
    claimed_at =
      null,
    lease_expires_at =
      null,
    last_checked_at =
      v_now,
    last_result_code =
      p_result_code,
    last_error =
      left(
        coalesce(
          nullif(
            btrim(
              p_error
            ),
            ''
          ),
          'Provider terminal resultCode ' ||
          p_result_code::text
        ),
        4000
      ),
    completed_at =
      v_now,
    updated_at =
      v_now
  where payment_transaction_id =
    p_payment_transaction_id
  returning *
  into v_job;

  return v_job;
end;
$$;


/*
 * ----------------------------------------------------------
 * Privileges.
 * ----------------------------------------------------------
 */

revoke all on function
public.cing_payment_ensure_wallet_topup_reconciliation_v2(bigint)
from public, anon, authenticated;

grant execute on function
public.cing_payment_ensure_wallet_topup_reconciliation_v2(bigint)
to service_role;

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

revoke all on function
public.cing_payment_accept_zalo_checkout_query_success_v2(
  bigint,
  uuid,
  text,
  bigint
)
from public, anon, authenticated;

grant execute on function
public.cing_payment_accept_zalo_checkout_query_success_v2(
  bigint,
  uuid,
  text,
  bigint
)
to service_role;

revoke all on function
public.cing_payment_terminal_fail_wallet_topup_reconciliation_v2(
  bigint,
  uuid,
  integer,
  text,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_payment_terminal_fail_wallet_topup_reconciliation_v2(
  bigint,
  uuid,
  integer,
  text,
  text
)
to service_role;

revoke all on function
public.cing_payment_wallet_topup_reconciliation_trigger_v2()
from public, anon, authenticated;

commit;
