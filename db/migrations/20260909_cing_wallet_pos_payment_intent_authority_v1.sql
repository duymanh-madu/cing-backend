begin;

/*
 * ==========================================================
 * CING WALLET — POS PAYMENT INTENT AUTHORITY V1
 * ==========================================================
 *
 * Purpose:
 * dynamic QR payment authority for in-store iPOS bills.
 *
 * Boundary:
 * - POS/provider supplies bill identity + amount
 * - customer identity does NOT exist at create time
 * - authenticated Mini App customer is bound only at settlement
 * - amount is immutable after intent creation
 * - customer never supplies payment amount
 * - one POS request creates at most one financial intent
 * - one intent can debit Wallet at most once
 * - Wallet mutation reuses canonical private Wallet authority
 */

create table public.cing_wallet_pos_payment_intents (
  id uuid
    primary key
    default gen_random_uuid(),

  /*
   * Non-secret public token identity.
   *
   * Application layer will wrap this UUID in a signed opaque
   * capability before putting it into the QR code.
   */
  payment_token_id uuid
    not null
    default gen_random_uuid(),

  provider text
    not null
    default 'ipos',

  /*
   * Stable idempotency identity supplied by the trusted
   * iPOS adapter for one create-payment request.
   */
  provider_request_key text
    not null,

  pos_parent text
    not null,

  pos_id text
    not null,

  bill_reference text,

  amount bigint
    not null,

  status text
    not null
    default 'pending',

  /*
   * Customer is intentionally unknown when POS creates QR.
   * It is permanently bound on successful Wallet settlement.
   */
  customer_user_id text
    references public.players(user_id)
    on update restrict
    on delete restrict,

  wallet_transaction_id uuid
    references public.cing_wallet_transactions(id)
    on update restrict
    on delete restrict,

  expires_at timestamptz
    not null,

  paid_at timestamptz,

  metadata jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint cing_wallet_pos_payment_intents_provider_ck
    check (
      provider = 'ipos'
    ),

  constraint cing_wallet_pos_payment_intents_provider_request_key_ck
    check (
      btrim(provider_request_key) <> ''
    ),

  constraint cing_wallet_pos_payment_intents_pos_parent_ck
    check (
      btrim(pos_parent) <> ''
    ),

  constraint cing_wallet_pos_payment_intents_pos_id_ck
    check (
      btrim(pos_id) <> ''
    ),

  constraint cing_wallet_pos_payment_intents_bill_reference_ck
    check (
      bill_reference is null
      or btrim(bill_reference) <> ''
    ),

  constraint cing_wallet_pos_payment_intents_amount_ck
    check (
      amount > 0
    ),

  constraint cing_wallet_pos_payment_intents_status_ck
    check (
      status in (
        'pending',
        'paid',
        'expired',
        'cancelled'
      )
    ),

  constraint cing_wallet_pos_payment_intents_expiry_ck
    check (
      expires_at > created_at
    ),

  /*
   * Paid state requires complete durable settlement proof.
   * Non-paid state must not carry partial Wallet proof.
   */
  constraint cing_wallet_pos_payment_intents_paid_proof_ck
    check (
      (
        status = 'paid'
        and customer_user_id is not null
        and wallet_transaction_id is not null
        and paid_at is not null
      )
      or
      (
        status <> 'paid'
        and wallet_transaction_id is null
        and paid_at is null
      )
    )
);


create unique index
  cing_wallet_pos_payment_intents_token_uq
on public.cing_wallet_pos_payment_intents (
  payment_token_id
);


create unique index
  cing_wallet_pos_payment_intents_provider_request_uq
on public.cing_wallet_pos_payment_intents (
  provider,
  provider_request_key
);


create index
  cing_wallet_pos_payment_intents_status_expiry_idx
on public.cing_wallet_pos_payment_intents (
  status,
  expires_at
);


create index
  cing_wallet_pos_payment_intents_customer_created_idx
on public.cing_wallet_pos_payment_intents (
  customer_user_id,
  created_at desc
)
where customer_user_id is not null;


/*
 * No direct mutation authority.
 */
revoke all
on table public.cing_wallet_pos_payment_intents
from public;

revoke all
on table public.cing_wallet_pos_payment_intents
from anon;

revoke all
on table public.cing_wallet_pos_payment_intents
from authenticated;

revoke all
on table public.cing_wallet_pos_payment_intents
from service_role;

grant select
on table public.cing_wallet_pos_payment_intents
to service_role;


/*
 * ==========================================================
 * CREATE INTENT
 * ==========================================================
 *
 * Trusted backend/iPOS adapter supplies provider identity.
 *
 * Replay:
 * same provider_request_key + same immutable bill semantics
 * returns the original intent.
 *
 * Same key with different amount/bill/POS fails closed.
 */
create or replace function
public.cing_wallet_create_pos_payment_intent_v1(
  p_provider_request_key text,
  p_pos_parent text,
  p_pos_id text,
  p_bill_reference text,
  p_amount bigint,
  p_expires_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  intent_id uuid,
  payment_token_id uuid,
  provider_request_key text,
  amount bigint,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_existing
    public.cing_wallet_pos_payment_intents%rowtype;

  v_created
    public.cing_wallet_pos_payment_intents%rowtype;

  v_request_key text;
  v_pos_parent text;
  v_pos_id text;
  v_bill_reference text;
begin
  v_request_key :=
    nullif(
      btrim(p_provider_request_key),
      ''
    );

  v_pos_parent :=
    nullif(
      btrim(p_pos_parent),
      ''
    );

  v_pos_id :=
    nullif(
      btrim(p_pos_id),
      ''
    );

  v_bill_reference :=
    case
      when p_bill_reference is null
        then null
      else nullif(
        btrim(p_bill_reference),
        ''
      )
    end;

  if v_request_key is null then
    raise exception
      'CING_WALLET_POS_REQUEST_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  if v_pos_parent is null then
    raise exception
      'CING_WALLET_POS_PARENT_REQUIRED'
      using errcode = '22023';
  end if;

  if v_pos_id is null then
    raise exception
      'CING_WALLET_POS_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_bill_reference is not null
     and v_bill_reference is null
  then
    raise exception
      'CING_WALLET_POS_BILL_REFERENCE_INVALID'
      using errcode = '22023';
  end if;

  if p_amount is null
     or p_amount <= 0
  then
    raise exception
      'CING_WALLET_POS_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  if p_expires_at is null
     or p_expires_at <= v_now
  then
    raise exception
      'CING_WALLET_POS_EXPIRY_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Hard safety ceiling only.
   * Application policy will normally issue ~5 minute QR TTL.
   */
  if p_expires_at >
      v_now + interval '15 minutes'
  then
    raise exception
      'CING_WALLET_POS_EXPIRY_TOO_LONG'
      using errcode = '22023';
  end if;

  select i.*
  into v_existing
  from public.cing_wallet_pos_payment_intents i
  where i.provider = 'ipos'
    and i.provider_request_key =
      v_request_key
  for update;

  if found then
    if v_existing.pos_parent <>
         v_pos_parent
       or v_existing.pos_id <>
         v_pos_id
       or v_existing.bill_reference
         is distinct from
         v_bill_reference
       or v_existing.amount <>
         p_amount
    then
      raise exception
        'CING_WALLET_POS_CREATE_REPLAY_CONFLICT'
        using errcode = '23505';
    end if;

    /*
     * Expiry is frozen on first creation.
     * Retried create requests never extend QR lifetime.
     */
    if v_existing.status = 'pending'
       and v_existing.expires_at <= v_now
    then
      update public.cing_wallet_pos_payment_intents
      set
        status = 'expired',
        updated_at = v_now
      where id = v_existing.id
      returning *
      into v_existing;
    end if;

    return query
    select
      v_existing.id,
      v_existing.payment_token_id,
      v_existing.provider_request_key,
      v_existing.amount,
      v_existing.status,
      v_existing.expires_at;

    return;
  end if;

  insert into public.cing_wallet_pos_payment_intents (
    provider,
    provider_request_key,
    pos_parent,
    pos_id,
    bill_reference,
    amount,
    expires_at,
    metadata
  )
  values (
    'ipos',
    v_request_key,
    v_pos_parent,
    v_pos_id,
    v_bill_reference,
    p_amount,
    p_expires_at,
    coalesce(
      p_metadata,
      '{}'::jsonb
    )
  )
  returning *
  into v_created;

  return query
  select
    v_created.id,
    v_created.payment_token_id,
    v_created.provider_request_key,
    v_created.amount,
    v_created.status,
    v_created.expires_at;
end;
$$;


/*
 * ==========================================================
 * IPOS QUERY STATUS
 * ==========================================================
 *
 * Does not know customer identity.
 * This will back the future iPOS /query adapter.
 */
create or replace function
public.cing_wallet_query_pos_payment_intent_v1(
  p_provider_request_key text
)
returns table (
  intent_id uuid,
  provider_request_key text,
  bill_reference text,
  amount bigint,
  status text,
  expires_at timestamptz,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_request_key text;
begin
  v_request_key :=
    nullif(
      btrim(p_provider_request_key),
      ''
    );

  if v_request_key is null then
    raise exception
      'CING_WALLET_POS_REQUEST_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  select i.*
  into v_intent
  from public.cing_wallet_pos_payment_intents i
  where i.provider = 'ipos'
    and i.provider_request_key =
      v_request_key
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_intent.status = 'pending'
     and v_intent.expires_at <= v_now
  then
    update public.cing_wallet_pos_payment_intents
    set
      status = 'expired',
      updated_at = v_now
    where id = v_intent.id
    returning *
    into v_intent;
  end if;

  return query
  select
    v_intent.id,
    v_intent.provider_request_key,
    v_intent.bill_reference,
    v_intent.amount,
    v_intent.status,
    v_intent.expires_at,
    v_intent.paid_at;
end;
$$;


/*
 * ==========================================================
 * CUSTOMER PREVIEW
 * ==========================================================
 *
 * Token identity is verified/signed by application layer later.
 *
 * User identity comes from authenticated Mini App customer,
 * never from QR payload.
 *
 * Reading a zero-balance Wallet does not create an account.
 */
create or replace function
public.cing_wallet_get_pos_payment_for_customer_v1(
  p_payment_token_id uuid,
  p_user_id text
)
returns table (
  intent_id uuid,
  payment_token_id uuid,
  bill_reference text,
  amount bigint,
  status text,
  expires_at timestamptz,
  wallet_balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_user_id text;
  v_balance bigint;
begin
  if p_payment_token_id is null then
    raise exception
      'CING_WALLET_POS_TOKEN_REQUIRED'
      using errcode = '22023';
  end if;

  v_user_id :=
    nullif(
      btrim(p_user_id),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_WALLET_POS_USER_REQUIRED'
      using errcode = '22023';
  end if;

  perform 1
  from public.players
  where user_id = v_user_id;

  if not found then
    raise exception
      'CING_WALLET_USER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select i.*
  into v_intent
  from public.cing_wallet_pos_payment_intents i
  where i.payment_token_id =
    p_payment_token_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_intent.status = 'pending'
     and v_intent.expires_at <= v_now
  then
    update public.cing_wallet_pos_payment_intents
    set
      status = 'expired',
      updated_at = v_now
    where id = v_intent.id
    returning *
    into v_intent;
  end if;

  select a.balance
  into v_balance
  from public.cing_wallet_accounts a
  where a.user_id = v_user_id;

  v_balance :=
    coalesce(
      v_balance,
      0
    );

  return query
  select
    v_intent.id,
    v_intent.payment_token_id,
    v_intent.bill_reference,
    v_intent.amount,
    v_intent.status,
    v_intent.expires_at,
    v_balance;
end;
$$;


/*
 * ==========================================================
 * CUSTOMER ATOMIC SETTLEMENT
 * ==========================================================
 *
 * Caller supplies:
 * - signed-token identity after app verification
 * - authenticated canonical customer identity
 *
 * Caller NEVER supplies amount.
 *
 * Lock order:
 * 1. payment intent
 * 2. Wallet account inside cing_wallet_apply_mutation_private
 *
 * Exactly one successful Wallet debit is possible.
 */
create or replace function
public.cing_wallet_settle_pos_payment_atomic_v1(
  p_payment_token_id uuid,
  p_user_id text
)
returns table (
  applied boolean,
  intent_id uuid,
  wallet_transaction_id uuid,
  amount bigint,
  wallet_balance_after bigint,
  status text,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_wallet_transaction
    public.cing_wallet_transactions%rowtype;

  v_user_id text;
  v_idempotency_key text;
begin
  if p_payment_token_id is null then
    raise exception
      'CING_WALLET_POS_TOKEN_REQUIRED'
      using errcode = '22023';
  end if;

  v_user_id :=
    nullif(
      btrim(p_user_id),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_WALLET_POS_USER_REQUIRED'
      using errcode = '22023';
  end if;

  select i.*
  into v_intent
  from public.cing_wallet_pos_payment_intents i
  where i.payment_token_id =
    p_payment_token_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_PAYMENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Successful replay.
   */
  if v_intent.status = 'paid' then
    if v_intent.customer_user_id
         is distinct from
         v_user_id
    then
      raise exception
        'CING_WALLET_POS_PAYMENT_ALREADY_PAID'
        using errcode = '55000';
    end if;

    if v_intent.wallet_transaction_id is null
       or v_intent.paid_at is null
    then
      raise exception
        'CING_WALLET_POS_PAID_PROOF_INVALID'
        using errcode = '55000';
    end if;

    select t.*
    into v_wallet_transaction
    from public.cing_wallet_transactions t
    where t.id =
      v_intent.wallet_transaction_id;

    if not found then
      raise exception
        'CING_WALLET_POS_LEDGER_MISSING'
        using errcode = '55000';
    end if;

    if v_wallet_transaction.user_id <>
         v_user_id
       or v_wallet_transaction.transaction_type <>
         'payment'
       or v_wallet_transaction.amount <>
         -v_intent.amount
       or v_wallet_transaction.reference_type
         is distinct from
         'pos_payment_intent'
       or v_wallet_transaction.reference_id
         is distinct from
         v_intent.id::text
    then
      raise exception
        'CING_WALLET_POS_LEDGER_CONFLICT'
        using errcode = '55000';
    end if;

    return query
    select
      false,
      v_intent.id,
      v_wallet_transaction.id,
      v_intent.amount,
      v_wallet_transaction.balance_after,
      v_intent.status,
      v_intent.paid_at;

    return;
  end if;

  if v_intent.status <> 'pending' then
    raise exception
      'CING_WALLET_POS_PAYMENT_NOT_PAYABLE'
      using errcode = '55000';
  end if;

  /*
   * Do not mutate status before raising.
   * Any exception would roll the statement back anyway.
   */
  if v_intent.expires_at <= v_now then
    raise exception
      'CING_WALLET_POS_PAYMENT_EXPIRED'
      using errcode = '55000';
  end if;

  perform 1
  from public.players
  where user_id = v_user_id;

  if not found then
    raise exception
      'CING_WALLET_USER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  v_idempotency_key :=
    'wallet_pos_payment:intent:'
    || v_intent.id::text;

  /*
   * Canonical Wallet mutation owns:
   * - Wallet account lock
   * - insufficient balance check
   * - non-negative invariant
   * - durable ledger
   * - global idempotency
   *
   * CING_WALLET_INSUFFICIENT_BALANCE therefore aborts
   * this entire settlement with zero mutation.
   */
  select *
  into v_wallet_transaction
  from public.cing_wallet_apply_mutation_private(
    v_user_id,
    'payment',
    -v_intent.amount,
    v_idempotency_key,
    'Thanh toán tại quầy bằng Cing Wallet',
    'pos_payment_intent',
    v_intent.id::text,
    null,
    'wallet_pos_payment',
    null,
    jsonb_build_object(
      'pos_payment_intent_id',
        v_intent.id,
      'provider',
        v_intent.provider,
      'provider_request_key',
        v_intent.provider_request_key,
      'pos_parent',
        v_intent.pos_parent,
      'pos_id',
        v_intent.pos_id,
      'bill_reference',
        v_intent.bill_reference
    )
  );

  if v_wallet_transaction.id is null then
    raise exception
      'CING_WALLET_POS_MUTATION_FAILED'
      using errcode = '55000';
  end if;

  update public.cing_wallet_pos_payment_intents
  set
    status = 'paid',
    customer_user_id =
      v_user_id,
    wallet_transaction_id =
      v_wallet_transaction.id,
    paid_at =
      v_now,
    updated_at =
      v_now
  where id = v_intent.id
    and status = 'pending'
  returning *
  into v_intent;

  if not found then
    raise exception
      'CING_WALLET_POS_PAYMENT_CONSUME_FAILED'
      using errcode = '55000';
  end if;

  return query
  select
    true,
    v_intent.id,
    v_wallet_transaction.id,
    v_intent.amount,
    v_wallet_transaction.balance_after,
    v_intent.status,
    v_intent.paid_at;
end;
$$;


/*
 * Backend-only authorities.
 */

revoke all on function
public.cing_wallet_create_pos_payment_intent_v1(
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  jsonb
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_create_pos_payment_intent_v1(
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  jsonb
)
to service_role;


revoke all on function
public.cing_wallet_query_pos_payment_intent_v1(text)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_query_pos_payment_intent_v1(text)
to service_role;


revoke all on function
public.cing_wallet_get_pos_payment_for_customer_v1(uuid, text)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_get_pos_payment_for_customer_v1(uuid, text)
to service_role;


revoke all on function
public.cing_wallet_settle_pos_payment_atomic_v1(uuid, text)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_settle_pos_payment_atomic_v1(uuid, text)
to service_role;


/*
 * Structural migration assertions.
 */
do $migration$
begin
  if to_regclass(
    'public.cing_wallet_pos_payment_intents'
  ) is null then
    raise exception
      'CING_WALLET_POS_PAYMENT_INTENTS_TABLE_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_create_pos_payment_intent_v1(text,text,text,text,bigint,timestamp with time zone,jsonb)'
  ) is null then
    raise exception
      'CING_WALLET_POS_CREATE_AUTHORITY_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_query_pos_payment_intent_v1(text)'
  ) is null then
    raise exception
      'CING_WALLET_POS_QUERY_AUTHORITY_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_get_pos_payment_for_customer_v1(uuid,text)'
  ) is null then
    raise exception
      'CING_WALLET_POS_CUSTOMER_READ_AUTHORITY_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_settle_pos_payment_atomic_v1(uuid,text)'
  ) is null then
    raise exception
      'CING_WALLET_POS_SETTLEMENT_AUTHORITY_MISSING';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_settle_pos_payment_atomic_v1(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'CING_WALLET_POS_AUTHENTICATED_SETTLEMENT_FORBIDDEN';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cing_wallet_settle_pos_payment_atomic_v1(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'CING_WALLET_POS_SERVICE_ROLE_SETTLEMENT_MISSING';
  end if;
end;
$migration$;

commit;
