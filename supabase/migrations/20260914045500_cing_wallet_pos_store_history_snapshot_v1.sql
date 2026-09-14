begin;

/*
 * ==========================================================
 * CING WALLET POS STORE HISTORY SNAPSHOT V1
 * ==========================================================
 *
 * Historical store attribution becomes part of the exact
 * Wallet debit ledger transaction.
 *
 * Source:
 *   immutable payment-intent metadata
 *
 * Destination:
 *   cing_wallet_transactions.metadata
 *
 * No live store lookup.
 * No Event11 dependency.
 * No second Wallet mutation.
 * Same settlement RPC signature.
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

    /*
     * Store attribution is immutable transaction evidence.
     *
     * Legacy payment intents may have no store snapshot.
     * But if any snapshot field exists, the complete tuple
     * must exist and a successful replay must prove the
     * committed Wallet ledger copied the exact same tuple.
     */
    if (
      nullif(
        btrim(
          coalesce(
            v_intent.metadata->>'store_id',
            ''
          )
        ),
        ''
      ) is not null
      or
      nullif(
        btrim(
          coalesce(
            v_intent.metadata->>'store_code',
            ''
          )
        ),
        ''
      ) is not null
      or
      nullif(
        btrim(
          coalesce(
            v_intent.metadata->>'store_display_name',
            ''
          )
        ),
        ''
      ) is not null
    ) then
      if
        nullif(
          btrim(
            coalesce(
              v_intent.metadata->>'store_id',
              ''
            )
          ),
          ''
        ) is null
        or
        nullif(
          btrim(
            coalesce(
              v_intent.metadata->>'store_code',
              ''
            )
          ),
          ''
        ) is null
        or
        nullif(
          btrim(
            coalesce(
              v_intent.metadata->>'store_display_name',
              ''
            )
          ),
          ''
        ) is null
      then
        raise exception
          'CING_WALLET_POS_STORE_SNAPSHOT_INVALID'
          using errcode = '55000';
      end if;

      if
        v_wallet_transaction.metadata->>'store_id'
          is distinct from
          v_intent.metadata->>'store_id'
        or
        v_wallet_transaction.metadata->>'store_code'
          is distinct from
          v_intent.metadata->>'store_code'
        or
        v_wallet_transaction.metadata->>'store_display_name'
          is distinct from
          v_intent.metadata->>'store_display_name'
      then
        raise exception
          'CING_WALLET_POS_LEDGER_STORE_SNAPSHOT_CONFLICT'
          using errcode = '55000';
      end if;
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

  /*
   * The settlement never queries the live store registry.
   *
   * The payment-intent metadata frozen before customer
   * confirmation is the historical source of truth.
   *
   * Legacy intents with zero store fields remain payable.
   * Partial snapshots fail closed before Wallet mutation.
   */
  if (
    nullif(
      btrim(
        coalesce(
          v_intent.metadata->>'store_id',
          ''
        )
      ),
      ''
    ) is not null
    or
    nullif(
      btrim(
        coalesce(
          v_intent.metadata->>'store_code',
          ''
        )
      ),
      ''
    ) is not null
    or
    nullif(
      btrim(
        coalesce(
          v_intent.metadata->>'store_display_name',
          ''
        )
      ),
      ''
    ) is not null
  ) then
    if
      nullif(
        btrim(
          coalesce(
            v_intent.metadata->>'store_id',
            ''
          )
        ),
        ''
      ) is null
      or
      nullif(
        btrim(
          coalesce(
            v_intent.metadata->>'store_code',
            ''
          )
        ),
        ''
      ) is null
      or
      nullif(
        btrim(
          coalesce(
            v_intent.metadata->>'store_display_name',
            ''
          )
        ),
        ''
      ) is null
    then
      raise exception
        'CING_WALLET_POS_STORE_SNAPSHOT_INVALID'
        using errcode = '55000';
    end if;
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
    ||
    case
      when
        nullif(
          btrim(
            coalesce(
              v_intent.metadata->>'store_id',
              ''
            )
          ),
          ''
        ) is not null
        and
        nullif(
          btrim(
            coalesce(
              v_intent.metadata->>'store_code',
              ''
            )
          ),
          ''
        ) is not null
        and
        nullif(
          btrim(
            coalesce(
              v_intent.metadata->>'store_display_name',
              ''
            )
          ),
          ''
        ) is not null
      then
        jsonb_build_object(
          'store_id',
            v_intent.metadata->>'store_id',
          'store_code',
            v_intent.metadata->>'store_code',
          'store_display_name',
            v_intent.metadata->>'store_display_name'
        )
      else
        '{}'::jsonb
    end
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
 * Preserve the original backend-only execution boundary.
 */
revoke all on function
public.cing_wallet_settle_pos_payment_atomic_v1(
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_settle_pos_payment_atomic_v1(
  uuid,
  text
)
to service_role;


/*
 * Structural authority assertions.
 */
do $migration$
begin
  if to_regprocedure(
    'public.cing_wallet_settle_pos_payment_atomic_v1(uuid,text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_SETTLEMENT_AUTHORITY_MISSING';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_settle_pos_payment_atomic_v1(uuid,text)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_AUTHENTICATED_SETTLEMENT_FORBIDDEN';
  end if;
end;
$migration$;

commit;
