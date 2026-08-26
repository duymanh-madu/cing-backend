begin;

/*
 * ==========================================================
 * CING PAYMENT — SETTLEMENT FOUNDATION V1
 * ==========================================================
 *
 * Separates commerce order payments from Wallet top-ups.
 *
 * Legacy payment rows remain purpose=order.
 * Wallet top-up rows receive stricter database invariants.
 */

alter table public.payment_transactions
  add column if not exists payment_purpose text
    not null
    default 'order';

alter table public.payment_transactions
  add column if not exists settlement_verified_at timestamptz;

alter table public.payment_transactions
  add column if not exists settlement_verification_method text;

alter table public.payment_transactions
  add column if not exists settlement_reference text;

alter table public.payment_transactions
  add column if not exists settlement_consumed_at timestamptz;


/*
 * Purpose contract.
 */
alter table public.payment_transactions
  add constraint payment_transactions_purpose_ck
  check (
    payment_purpose in (
      'order',
      'wallet_topup'
    )
  );


/*
 * Wallet top-up transactions must be financially valid.
 *
 * Historical order rows are intentionally untouched because
 * legacy rows include null/zero values.
 */
alter table public.payment_transactions
  add constraint payment_transactions_wallet_topup_amount_ck
  check (
    payment_purpose <> 'wallet_topup'
    or (
      amount is not null
      and amount > 0
      and amount = trunc(amount)
    )
  );


alter table public.payment_transactions
  add constraint payment_transactions_wallet_topup_identity_ck
  check (
    payment_purpose <> 'wallet_topup'
    or (
      transaction_code is not null
      and btrim(transaction_code) <> ''
      and payment_provider is not null
      and btrim(payment_provider) <> ''
      and payment_method is not null
      and btrim(payment_method) <> ''
    )
  );


/*
 * A verified settlement must carry durable proof metadata.
 */
alter table public.payment_transactions
  add constraint payment_transactions_settlement_proof_ck
  check (
    settlement_verified_at is null
    or (
      settlement_verification_method is not null
      and btrim(settlement_verification_method) <> ''
      and settlement_reference is not null
      and btrim(settlement_reference) <> ''
    )
  );


/*
 * Once consumed by downstream financial authority, settlement
 * must already have been cryptographically/provider verified.
 */
alter table public.payment_transactions
  add constraint payment_transactions_settlement_consumed_ck
  check (
    settlement_consumed_at is null
    or settlement_verified_at is not null
  );


/*
 * Existing audit proved there are no duplicate transaction codes.
 */
create unique index
  payment_transactions_transaction_code_uq
on public.payment_transactions (
  transaction_code
)
where transaction_code is not null;


/*
 * Existing audit proved provider settlement IDs are unique per
 * provider. This becomes durable replay protection.
 */
create unique index
  payment_transactions_provider_transaction_uq
on public.payment_transactions (
  payment_provider,
  provider_transaction_id
)
where
  payment_provider is not null
  and provider_transaction_id is not null;


/*
 * Top-up settlement worker/query access path.
 */
create index
  payment_transactions_wallet_topup_settlement_idx
on public.payment_transactions (
  payment_status,
  settlement_verified_at,
  settlement_consumed_at,
  created_at
)
where payment_purpose = 'wallet_topup';


/*
 * Structural assertions.
 */
do $migration$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_transactions'
      and column_name = 'payment_purpose'
  ) then
    raise exception
      'PAYMENT_SETTLEMENT_PURPOSE_COLUMN_MISSING';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'payment_transactions'
      and indexname =
        'payment_transactions_transaction_code_uq'
  ) then
    raise exception
      'PAYMENT_SETTLEMENT_TRANSACTION_CODE_UNIQUENESS_MISSING';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'payment_transactions'
      and indexname =
        'payment_transactions_provider_transaction_uq'
  ) then
    raise exception
      'PAYMENT_SETTLEMENT_PROVIDER_UNIQUENESS_MISSING';
  end if;
end;
$migration$;

commit;
