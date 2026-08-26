begin;

/*
 * ==========================================================
 * CING WALLET — CORE AUTHORITY V1
 * ==========================================================
 *
 * Closed-loop prepaid balance foundation.
 *
 * Authority rules:
 * - one canonical balance per user
 * - PostgreSQL is authoritative
 * - every balance mutation has one durable ledger row
 * - no negative balances
 * - no direct client/backend table writes
 * - mutation primitive is private even from service_role
 * - dedicated domain RPCs will be layered on top later
 * - idempotency is durable and database-enforced
 */

create table public.cing_wallet_accounts (
  user_id text
    primary key
    references public.players(user_id)
    on update restrict
    on delete restrict,

  balance bigint
    not null
    default 0,

  status text
    not null
    default 'active',

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint cing_wallet_accounts_user_id_ck
    check (
      btrim(user_id) <> ''
    ),

  constraint cing_wallet_accounts_balance_ck
    check (
      balance >= 0
    ),

  constraint cing_wallet_accounts_status_ck
    check (
      status in (
        'active',
        'frozen',
        'closed'
      )
    )
);


create table public.cing_wallet_transactions (
  id uuid
    primary key
    default gen_random_uuid(),

  user_id text
    not null
    references public.cing_wallet_accounts(user_id)
    on update restrict
    on delete restrict,

  transaction_type text
    not null,

  amount bigint
    not null,

  balance_before bigint
    not null,

  balance_after bigint
    not null,

  idempotency_key text
    not null,

  reference_type text,

  reference_id text,

  reason text
    not null,

  note text,

  actor_type text
    not null,

  actor_id text,

  metadata jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now(),

  constraint cing_wallet_transactions_type_ck
    check (
      transaction_type in (
        'topup',
        'topup_promotion',
        'payment',
        'refund',
        'reversal',
        'admin_adjustment'
      )
    ),

  constraint cing_wallet_transactions_amount_ck
    check (
      amount <> 0
    ),

  constraint cing_wallet_transactions_direction_ck
    check (
      (
        transaction_type in (
          'topup',
          'topup_promotion',
          'refund'
        )
        and amount > 0
      )
      or (
        transaction_type = 'payment'
        and amount < 0
      )
      or (
        transaction_type in (
          'reversal',
          'admin_adjustment'
        )
        and amount <> 0
      )
    ),

  constraint cing_wallet_transactions_balance_before_ck
    check (
      balance_before >= 0
    ),

  constraint cing_wallet_transactions_balance_after_ck
    check (
      balance_after >= 0
    ),

  constraint cing_wallet_transactions_balance_math_ck
    check (
      balance_after =
        balance_before + amount
    ),

  constraint cing_wallet_transactions_idempotency_key_ck
    check (
      btrim(idempotency_key) <> ''
    ),

  constraint cing_wallet_transactions_reference_type_ck
    check (
      reference_type is null
      or btrim(reference_type) <> ''
    ),

  constraint cing_wallet_transactions_reference_id_ck
    check (
      reference_id is null
      or btrim(reference_id) <> ''
    ),

  constraint cing_wallet_transactions_reason_ck
    check (
      btrim(reason) <> ''
    ),

  constraint cing_wallet_transactions_note_ck
    check (
      note is null
      or btrim(note) <> ''
    ),

  constraint cing_wallet_transactions_actor_type_ck
    check (
      btrim(actor_type) <> ''
    ),

  constraint cing_wallet_transactions_actor_id_ck
    check (
      actor_id is null
      or btrim(actor_id) <> ''
    )
);


/*
 * One financial mutation for one globally unique idempotency key.
 */
create unique index
  cing_wallet_transactions_idempotency_uq
on public.cing_wallet_transactions (
  idempotency_key
);


/*
 * Customer statement/history access.
 */
create index
  cing_wallet_transactions_user_created_idx
on public.cing_wallet_transactions (
  user_id,
  created_at desc
);


/*
 * Admin reporting by transaction type and time.
 */
create index
  cing_wallet_transactions_type_created_idx
on public.cing_wallet_transactions (
  transaction_type,
  created_at desc
);


/*
 * Reconciliation/reference lookup.
 */
create index
  cing_wallet_transactions_reference_idx
on public.cing_wallet_transactions (
  reference_type,
  reference_id
)
where
  reference_type is not null
  and reference_id is not null;


/*
 * Tables are readable by backend but never directly mutable.
 */
revoke all
on table public.cing_wallet_accounts
from public;

revoke all
on table public.cing_wallet_accounts
from anon;

revoke all
on table public.cing_wallet_accounts
from authenticated;

revoke all
on table public.cing_wallet_accounts
from service_role;

grant select
on table public.cing_wallet_accounts
to service_role;


revoke all
on table public.cing_wallet_transactions
from public;

revoke all
on table public.cing_wallet_transactions
from anon;

revoke all
on table public.cing_wallet_transactions
from authenticated;

revoke all
on table public.cing_wallet_transactions
from service_role;

grant select
on table public.cing_wallet_transactions
to service_role;


/*
 * ==========================================================
 * PRIVATE MUTATION PRIMITIVE
 * ==========================================================
 *
 * This is deliberately NOT executable by service_role.
 *
 * Future domain authorities:
 * - top-up settlement
 * - top-up promotion
 * - wallet payment
 * - refund / reversal
 * - admin adjustment
 *
 * will call this primitive from bounded SECURITY DEFINER RPCs.
 */
create or replace function
public.cing_wallet_apply_mutation_private(
  p_user_id text,
  p_transaction_type text,
  p_amount bigint,
  p_idempotency_key text,
  p_reason text,
  p_reference_type text default null,
  p_reference_id text default null,
  p_note text default null,
  p_actor_type text default 'system',
  p_actor_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.cing_wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_idempotency_key text;
  v_existing public.cing_wallet_transactions%rowtype;
  v_account public.cing_wallet_accounts%rowtype;
  v_transaction public.cing_wallet_transactions%rowtype;
  v_balance_after bigint;
begin
  v_user_id :=
    nullif(
      btrim(p_user_id),
      ''
    );

  v_idempotency_key :=
    nullif(
      btrim(p_idempotency_key),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_WALLET_USER_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_transaction_type is null
    or p_transaction_type not in (
      'topup',
      'topup_promotion',
      'payment',
      'refund',
      'reversal',
      'admin_adjustment'
    )
  then
    raise exception
      'CING_WALLET_TRANSACTION_TYPE_INVALID'
      using errcode = '22023';
  end if;

  if p_amount is null
    or p_amount = 0
  then
    raise exception
      'CING_WALLET_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  if v_idempotency_key is null then
    raise exception
      'CING_WALLET_IDEMPOTENCY_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'CING_WALLET_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  if p_actor_type is null
    or btrim(p_actor_type) = ''
  then
    raise exception
      'CING_WALLET_ACTOR_TYPE_REQUIRED'
      using errcode = '22023';
  end if;

  if p_reference_type is not null
    and btrim(p_reference_type) = ''
  then
    raise exception
      'CING_WALLET_REFERENCE_TYPE_INVALID'
      using errcode = '22023';
  end if;

  if p_reference_id is not null
    and btrim(p_reference_id) = ''
  then
    raise exception
      'CING_WALLET_REFERENCE_ID_INVALID'
      using errcode = '22023';
  end if;

  if p_note is not null
    and btrim(p_note) = ''
  then
    raise exception
      'CING_WALLET_NOTE_INVALID'
      using errcode = '22023';
  end if;

  if p_actor_id is not null
    and btrim(p_actor_id) = ''
  then
    raise exception
      'CING_WALLET_ACTOR_ID_INVALID'
      using errcode = '22023';
  end if;

  if (
    p_transaction_type in (
      'topup',
      'topup_promotion',
      'refund'
    )
    and p_amount <= 0
  )
  or (
    p_transaction_type = 'payment'
    and p_amount >= 0
  )
  then
    raise exception
      'CING_WALLET_TRANSACTION_DIRECTION_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Wallet identity must belong to the canonical Cing user
   * authority. Never create financial accounts for arbitrary
   * opaque text identifiers.
   */
  perform 1
  from public.players
  where user_id = v_user_id;

  if not found then
    raise exception
      'CING_WALLET_USER_NOT_FOUND'
      using errcode = '22023';
  end if;

  /*
   * Fast idempotent replay path.
   */
  select *
  into v_existing
  from public.cing_wallet_transactions
  where idempotency_key =
    v_idempotency_key;

  if found then
    if v_existing.user_id <> v_user_id
      or v_existing.transaction_type <>
        p_transaction_type
      or v_existing.amount <> p_amount
      or v_existing.reference_type is distinct from
        p_reference_type
      or v_existing.reference_id is distinct from
        p_reference_id
    then
      raise exception
        'CING_WALLET_IDEMPOTENCY_CONFLICT'
        using errcode = '23505';
    end if;

    return v_existing;
  end if;

  /*
   * Create the account lazily.
   *
   * ON CONFLICT makes concurrent first-use safe.
   */
  insert into public.cing_wallet_accounts (
    user_id
  )
  values (
    v_user_id
  )
  on conflict (user_id)
  do nothing;

  /*
   * The wallet row is the single serialization boundary for
   * all balance mutations for one user.
   */
  select *
  into v_account
  from public.cing_wallet_accounts
  where user_id = v_user_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_ACCOUNT_NOT_FOUND'
      using errcode = '55000';
  end if;

  /*
   * Re-check after acquiring the wallet lock.
   *
   * Concurrent retries for the same user/key serialize here.
   */
  select *
  into v_existing
  from public.cing_wallet_transactions
  where idempotency_key =
    v_idempotency_key;

  if found then
    if v_existing.user_id <> v_user_id
      or v_existing.transaction_type <>
        p_transaction_type
      or v_existing.amount <> p_amount
      or v_existing.reference_type is distinct from
        p_reference_type
      or v_existing.reference_id is distinct from
        p_reference_id
    then
      raise exception
        'CING_WALLET_IDEMPOTENCY_CONFLICT'
        using errcode = '23505';
    end if;

    return v_existing;
  end if;

  /*
   * bigint arithmetic is used because Wallet represents VND
   * integer units and must never depend on floating point.
   */
  begin
    v_balance_after :=
      v_account.balance + p_amount;
  exception
    when numeric_value_out_of_range then
      raise exception
        'CING_WALLET_BALANCE_OVERFLOW'
        using errcode = '22003';
  end;

  if v_balance_after < 0 then
    raise exception
      'CING_WALLET_INSUFFICIENT_BALANCE'
      using errcode = '22003';
  end if;

  /*
   * Ledger insert occurs before account projection mutation.
   *
   * If durable idempotency uniqueness rejects this insert,
   * PostgreSQL rolls the whole statement/transaction back.
   */
  insert into public.cing_wallet_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    idempotency_key,
    reference_type,
    reference_id,
    reason,
    note,
    actor_type,
    actor_id,
    metadata
  )
  values (
    v_user_id,
    p_transaction_type,
    p_amount,
    v_account.balance,
    v_balance_after,
    v_idempotency_key,
    p_reference_type,
    p_reference_id,
    btrim(p_reason),
    case
      when p_note is null
        then null
      else btrim(p_note)
    end,
    btrim(p_actor_type),
    case
      when p_actor_id is null
        then null
      else btrim(p_actor_id)
    end,
    coalesce(
      p_metadata,
      '{}'::jsonb
    )
  )
  returning *
  into v_transaction;

  update public.cing_wallet_accounts
  set
    balance = v_balance_after,
    updated_at = clock_timestamp()
  where user_id = v_user_id;

  if not found then
    raise exception
      'CING_WALLET_BALANCE_UPDATE_FAILED'
      using errcode = '55000';
  end if;

  return v_transaction;
end;
$$;


/*
 * The primitive is private to database-owned authorities.
 */
revoke all
on function
public.cing_wallet_apply_mutation_private(
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
from public;

revoke all
on function
public.cing_wallet_apply_mutation_private(
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
from anon;

revoke all
on function
public.cing_wallet_apply_mutation_private(
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
from authenticated;

revoke all
on function
public.cing_wallet_apply_mutation_private(
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
from service_role;


/*
 * Structural postconditions.
 */
do $migration$
begin
  if to_regclass(
    'public.cing_wallet_accounts'
  ) is null then
    raise exception
      'CING_WALLET_ACCOUNTS_TABLE_MISSING';
  end if;

  if to_regclass(
    'public.cing_wallet_transactions'
  ) is null then
    raise exception
      'CING_WALLET_TRANSACTIONS_TABLE_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_apply_mutation_private('
    || 'text,text,bigint,text,text,text,text,text,text,text,jsonb)'
  ) is null then
    raise exception
      'CING_WALLET_PRIVATE_MUTATION_RPC_MISSING';
  end if;
end;
$migration$;

commit;
