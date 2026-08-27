begin;

alter table public.payment_transactions
  add column if not exists
    wallet_topup_promotion_snapshot jsonb;

alter table public.payment_transactions
  add constraint
    payment_transactions_wallet_topup_promotion_snapshot_ck
  check (
    wallet_topup_promotion_snapshot is null
    or (
      payment_purpose = 'wallet_topup'
      and jsonb_typeof(
        wallet_topup_promotion_snapshot
      ) = 'object'
    )
  )
  not valid;

create or replace function
public.cing_wallet_settle_verified_topup_atomic(
  p_payment_transaction_id bigint
)
returns public.cing_wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_wallet_transaction
    public.cing_wallet_transactions%rowtype;
  v_promotion_transaction
    public.cing_wallet_transactions%rowtype;

  v_user_id text;
  v_amount bigint;
  v_idempotency_key text;
  v_promotion_idempotency_key text;
  v_reference_id text;

  v_promotion_snapshot jsonb;
  v_promotion_qualified boolean;
  v_promotion_bonus bigint;
  v_promotion_min_topup bigint;
  v_promotion_name text;
begin
  if p_payment_transaction_id is null then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_ID_REQUIRED'
      using errcode = '22023';
  end if;

  select *
  into v_payment
  from public.payment_transactions
  where id = p_payment_transaction_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_NOT_FOUND'
      using errcode = '22023';
  end if;

  if v_payment.payment_purpose <> 'wallet_topup' then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_PURPOSE_INVALID'
      using errcode = '22023';
  end if;

  if v_payment.payment_status <> 'paid' then
    raise exception
      'CING_WALLET_TOPUP_PAYMENT_NOT_PAID'
      using errcode = '55000';
  end if;

  if v_payment.settlement_verified_at is null
    or v_payment.settlement_verification_method is null
    or btrim(v_payment.settlement_verification_method) = ''
    or v_payment.settlement_reference is null
    or btrim(v_payment.settlement_reference) = ''
  then
    raise exception
      'CING_WALLET_TOPUP_SETTLEMENT_NOT_VERIFIED'
      using errcode = '55000';
  end if;

  if v_payment.amount is null
    or v_payment.amount <= 0
    or v_payment.amount <> trunc(v_payment.amount)
  then
    raise exception
      'CING_WALLET_TOPUP_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  begin
    v_amount := v_payment.amount::bigint;
  exception
    when numeric_value_out_of_range then
      raise exception
        'CING_WALLET_TOPUP_AMOUNT_OUT_OF_RANGE'
        using errcode = '22003';
  end;

  v_user_id :=
    nullif(
      btrim(v_payment.user_id),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_WALLET_TOPUP_USER_ID_INVALID'
      using errcode = '22023';
  end if;

  v_reference_id := v_payment.id::text;

  v_idempotency_key :=
    'wallet_topup:payment:' ||
    v_reference_id;

  v_promotion_idempotency_key :=
    'wallet_topup_promotion:payment:' ||
    v_reference_id;

  /*
   * Freeze promotion decision exactly once.
   *
   * NULL means this settlement has never made a promotion
   * decision. Once written, retries must use this snapshot and
   * never re-evaluate current admin configuration.
   */
  v_promotion_snapshot :=
    v_payment.wallet_topup_promotion_snapshot;

  if v_promotion_snapshot is null
    and v_payment.settlement_consumed_at is not null
  then
    /*
     * Legacy pre-V2 settlement.
     *
     * A payment already consumed before promotion snapshot
     * authority existed must never be reclassified using a
     * later promotion configuration.
     */
    v_promotion_snapshot :=
      jsonb_build_object(
        'version', 1,
        'qualified', false
      );

  elsif v_promotion_snapshot is null then
    select
      case
        when c.enabled
          and (
            c.starts_at is null
            or clock_timestamp() >= c.starts_at
          )
          and (
            c.ends_at is null
            or clock_timestamp() < c.ends_at
          )
          and t.min_topup_amount is not null
        then
          jsonb_build_object(
            'version', 1,
            'qualified', true,
            'promotion_name', c.name,
            'min_topup_amount',
              t.min_topup_amount,
            'bonus_amount',
              t.bonus_amount
          )
        else
          jsonb_build_object(
            'version', 1,
            'qualified', false
          )
      end
    into v_promotion_snapshot
    from
      public.cing_wallet_topup_promotion_config c
    left join lateral (
      select
        pt.min_topup_amount,
        pt.bonus_amount
      from
        public.cing_wallet_topup_promotion_tiers pt
      where
        pt.config_id = c.id
        and pt.min_topup_amount <= v_amount
      order by
        pt.min_topup_amount desc
      limit 1
    ) t on true
    where c.id = 1;

    if v_promotion_snapshot is null then
      raise exception
        'CING_WALLET_PROMOTION_CONFIG_MISSING'
        using errcode = '55000';
    end if;

    update public.payment_transactions
    set
      wallet_topup_promotion_snapshot =
        v_promotion_snapshot,
      updated_at =
        clock_timestamp()
    where id = v_payment.id
      and wallet_topup_promotion_snapshot
        is null;

    if not found then
      raise exception
        'CING_WALLET_PROMOTION_SNAPSHOT_FREEZE_FAILED'
        using errcode = '55000';
    end if;
  end if;

  if jsonb_typeof(v_promotion_snapshot) <> 'object'
    or not (v_promotion_snapshot ? 'version')
    or not (v_promotion_snapshot ? 'qualified')
    or (v_promotion_snapshot ->> 'version') <> '1'
    or jsonb_typeof(
      v_promotion_snapshot -> 'qualified'
    ) <> 'boolean'
  then
    raise exception
      'CING_WALLET_PROMOTION_SNAPSHOT_INVALID'
      using errcode = '55000';
  end if;

  v_promotion_qualified :=
    (v_promotion_snapshot ->> 'qualified')::boolean;

  if v_promotion_qualified then
    if not (
      v_promotion_snapshot ? 'min_topup_amount'
    )
      or not (
        v_promotion_snapshot ? 'bonus_amount'
      )
      or (
        v_promotion_snapshot ->>
        'min_topup_amount'
      ) !~ '^[0-9]+$'
      or (
        v_promotion_snapshot ->>
        'bonus_amount'
      ) !~ '^[0-9]+$'
    then
      raise exception
        'CING_WALLET_PROMOTION_SNAPSHOT_INVALID'
        using errcode = '55000';
    end if;

    begin
      v_promotion_min_topup :=
        (
          v_promotion_snapshot ->>
          'min_topup_amount'
        )::bigint;

      v_promotion_bonus :=
        (
          v_promotion_snapshot ->>
          'bonus_amount'
        )::bigint;
    exception
      when numeric_value_out_of_range then
        raise exception
          'CING_WALLET_PROMOTION_SNAPSHOT_INVALID'
          using errcode = '55000';
    end;

    if v_promotion_min_topup <= 0
      or v_promotion_bonus <= 0
      or v_promotion_min_topup > v_amount
    then
      raise exception
        'CING_WALLET_PROMOTION_SNAPSHOT_INVALID'
        using errcode = '55000';
    end if;

    v_promotion_name :=
      nullif(
        btrim(
          v_promotion_snapshot ->>
          'promotion_name'
        ),
        ''
      );
  else
    v_promotion_bonus := 0;
    v_promotion_min_topup := null;
    v_promotion_name := null;
  end if;

  /*
   * Completed settlement replay.
   *
   * Base ledger is mandatory. Promotion ledger is mandatory
   * exactly when the frozen snapshot says qualified=true.
   */
  if v_payment.settlement_consumed_at
    is not null
  then
    select *
    into v_wallet_transaction
    from public.cing_wallet_transactions
    where idempotency_key =
      v_idempotency_key;

    if not found then
      raise exception
        'CING_WALLET_TOPUP_CONSUMED_LEDGER_MISSING'
        using errcode = '55000';
    end if;

    if v_wallet_transaction.user_id <> v_user_id
      or v_wallet_transaction.transaction_type <>
        'topup'
      or v_wallet_transaction.amount <> v_amount
      or v_wallet_transaction.reference_type
        is distinct from
        'payment_transaction'
      or v_wallet_transaction.reference_id
        is distinct from
        v_reference_id
    then
      raise exception
        'CING_WALLET_TOPUP_CONSUMED_LEDGER_CONFLICT'
        using errcode = '55000';
    end if;

    select *
    into v_promotion_transaction
    from public.cing_wallet_transactions
    where idempotency_key =
      v_promotion_idempotency_key;

    if v_promotion_qualified then
      if not found then
        raise exception
          'CING_WALLET_PROMOTION_CONSUMED_LEDGER_MISSING'
          using errcode = '55000';
      end if;

      if v_promotion_transaction.user_id <>
          v_user_id
        or
        v_promotion_transaction.transaction_type <>
          'topup_promotion'
        or
        v_promotion_transaction.amount <>
          v_promotion_bonus
        or
        v_promotion_transaction.reference_type
          is distinct from
          'payment_transaction'
        or
        v_promotion_transaction.reference_id
          is distinct from
          v_reference_id
      then
        raise exception
          'CING_WALLET_PROMOTION_CONSUMED_LEDGER_CONFLICT'
          using errcode = '55000';
      end if;
    else
      if found then
        raise exception
          'CING_WALLET_PROMOTION_UNQUALIFIED_LEDGER_CONFLICT'
          using errcode = '55000';
      end if;
    end if;

    return v_wallet_transaction;
  end if;

  select *
  into v_wallet_transaction
  from public.cing_wallet_apply_mutation_private(
    v_user_id,
    'topup',
    v_amount,
    v_idempotency_key,
    'Nạp tiền Cing Wallet',
    'payment_transaction',
    v_reference_id,
    null,
    'payment_settlement',
    null,
    jsonb_build_object(
      'payment_transaction_id',
        v_payment.id,
      'transaction_code',
        v_payment.transaction_code,
      'payment_provider',
        v_payment.payment_provider,
      'payment_method',
        v_payment.payment_method,
      'settlement_reference',
        v_payment.settlement_reference,
      'settlement_verification_method',
        v_payment.settlement_verification_method,
      'settlement_verified_at',
        v_payment.settlement_verified_at,
      'promotion_snapshot',
        v_promotion_snapshot
    )
  );

  if v_wallet_transaction.id is null then
    raise exception
      'CING_WALLET_TOPUP_LEDGER_WRITE_FAILED'
      using errcode = '55000';
  end if;

  if v_promotion_qualified then
    select *
    into v_promotion_transaction
    from public.cing_wallet_apply_mutation_private(
      v_user_id,
      'topup_promotion',
      v_promotion_bonus,
      v_promotion_idempotency_key,
      'Khuyến mại nạp Cing Wallet',
      'payment_transaction',
      v_reference_id,
      null,
      'payment_settlement',
      null,
      jsonb_build_object(
        'payment_transaction_id',
          v_payment.id,
        'base_topup_amount',
          v_amount,
        'promotion_name',
          v_promotion_name,
        'min_topup_amount',
          v_promotion_min_topup,
        'bonus_amount',
          v_promotion_bonus,
        'promotion_snapshot',
          v_promotion_snapshot
      )
    );

    if v_promotion_transaction.id is null then
      raise exception
        'CING_WALLET_PROMOTION_LEDGER_WRITE_FAILED'
        using errcode = '55000';
    end if;
  end if;

  update public.payment_transactions
  set
    settlement_consumed_at =
      clock_timestamp(),
    updated_at =
      clock_timestamp()
  where id = v_payment.id
    and settlement_consumed_at is null;

  if not found then
    raise exception
      'CING_WALLET_TOPUP_SETTLEMENT_CONSUME_FAILED'
      using errcode = '55000';
  end if;

  return v_wallet_transaction;
end;
$$;

revoke all
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
from public;

revoke all
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
from anon;

revoke all
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
from authenticated;

revoke all
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
from service_role;

grant execute
on function
public.cing_wallet_settle_verified_topup_atomic(
  bigint
)
to service_role;

commit;
