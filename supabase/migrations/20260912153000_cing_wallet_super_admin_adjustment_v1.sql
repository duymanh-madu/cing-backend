begin;

/*
 * ==========================================================
 * CING WALLET — SUPER ADMIN ADJUSTMENT AUTHORITY V1
 * ==========================================================
 *
 * Purpose:
 * - emergency/manual debit
 * - complaint/manual compensation credit
 * - auditable financial correction
 *
 * Safety:
 * - bounded SECURITY DEFINER authority
 * - service_role only
 * - immutable Wallet ledger
 * - no direct balance mutation here
 * - canonical private Wallet mutation primitive only
 * - durable UUID idempotency
 * - replay semantics are immutable
 * - actor is supplied only by authenticated backend
 */

create or replace function
public.cing_wallet_admin_adjust_balance_atomic_v1(
  p_user_id text,
  p_direction text,
  p_amount bigint,
  p_request_id uuid,
  p_reason_code text,
  p_note text default null,
  p_reference_type text default null,
  p_reference_id text default null,
  p_actor_id text default null
)
returns table (
  transaction_id uuid,
  user_id text,
  direction text,
  amount bigint,
  signed_amount bigint,
  balance_before bigint,
  balance_after bigint,
  reason_code text,
  note text,
  reference_type text,
  reference_id text,
  actor_id text,
  created_at timestamptz,
  applied boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id text;
  v_direction text;
  v_reason_code text;
  v_note text;
  v_reference_type text;
  v_reference_id text;
  v_actor_id text;
  v_signed_amount bigint;
  v_idempotency_key text;
  v_existing public.cing_wallet_transactions%rowtype;
  v_transaction public.cing_wallet_transactions%rowtype;
begin
  v_user_id :=
    nullif(
      btrim(p_user_id),
      ''
    );

  v_direction :=
    lower(
      coalesce(
        nullif(
          btrim(p_direction),
          ''
        ),
        ''
      )
    );

  v_reason_code :=
    lower(
      coalesce(
        nullif(
          btrim(p_reason_code),
          ''
        ),
        ''
      )
    );

  v_note :=
    case
      when p_note is null
        then null
      else nullif(
        btrim(p_note),
        ''
      )
    end;

  v_reference_type :=
    case
      when p_reference_type is null
        then null
      else nullif(
        btrim(p_reference_type),
        ''
      )
    end;

  v_reference_id :=
    case
      when p_reference_id is null
        then null
      else nullif(
        btrim(p_reference_id),
        ''
      )
    end;

  v_actor_id :=
    case
      when p_actor_id is null
        then null
      else nullif(
        btrim(p_actor_id),
        ''
      )
    end;

  if v_user_id is null then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_USER_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if v_direction not in (
    'credit',
    'debit'
  ) then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_DIRECTION_INVALID'
      using errcode = '22023';
  end if;

  if p_amount is null
     or p_amount <= 0
  then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if v_reason_code = ''
     or v_reason_code !~ '^[a-z0-9][a-z0-9_]{1,63}$'
  then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_REASON_CODE_INVALID'
      using errcode = '22023';
  end if;

  if p_note is not null
     and v_note is null
  then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_NOTE_INVALID'
      using errcode = '22023';
  end if;

  if v_note is not null
     and length(v_note) > 1000
  then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_NOTE_INVALID'
      using errcode = '22023';
  end if;

  if (
    v_reference_type is null
  ) <> (
    v_reference_id is null
  ) then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_REFERENCE_INVALID'
      using errcode = '22023';
  end if;

  if v_reference_type is not null
     and (
       length(v_reference_type) > 100
       or v_reference_type !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
     )
  then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_REFERENCE_INVALID'
      using errcode = '22023';
  end if;

  if v_reference_id is not null
     and length(v_reference_id) > 300
  then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_REFERENCE_INVALID'
      using errcode = '22023';
  end if;

  if v_actor_id is null
     or length(v_actor_id) > 512
  then
    raise exception
      'CING_WALLET_ADMIN_ADJUSTMENT_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  v_signed_amount :=
    case
      when v_direction = 'credit'
        then p_amount
      else -p_amount
    end;

  v_idempotency_key :=
    'wallet_admin_adjustment:' ||
    p_request_id::text;

  /*
   * Fence concurrent execution of the same request UUID.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_idempotency_key,
      0
    )
  );

  select wt.*
  into v_existing
  from public.cing_wallet_transactions wt
  where wt.idempotency_key =
    v_idempotency_key
  for update;

  if found then
    if v_existing.user_id <>
         v_user_id
       or v_existing.transaction_type <>
         'admin_adjustment'
       or v_existing.amount <>
         v_signed_amount
       or v_existing.reason <>
         v_reason_code
       or v_existing.note
         is distinct from
         v_note
       or v_existing.reference_type
         is distinct from
         v_reference_type
       or v_existing.reference_id
         is distinct from
         v_reference_id
       or v_existing.actor_type <>
         'admin'
       or v_existing.actor_id
         is distinct from
         v_actor_id
    then
      raise exception
        'CING_WALLET_ADMIN_ADJUSTMENT_REPLAY_CONFLICT'
        using errcode = '23505';
    end if;

    return query
    select
      v_existing.id,
      v_existing.user_id,
      case
        when v_existing.amount > 0
          then 'credit'::text
        else 'debit'::text
      end,
      abs(v_existing.amount),
      v_existing.amount,
      v_existing.balance_before,
      v_existing.balance_after,
      v_existing.reason,
      v_existing.note,
      v_existing.reference_type,
      v_existing.reference_id,
      v_existing.actor_id,
      v_existing.created_at,
      false;

    return;
  end if;

  select *
  into v_transaction
  from public.cing_wallet_apply_mutation_private(
    p_user_id =>
      v_user_id,
    p_transaction_type =>
      'admin_adjustment',
    p_amount =>
      v_signed_amount,
    p_idempotency_key =>
      v_idempotency_key,
    p_reason =>
      v_reason_code,
    p_reference_type =>
      v_reference_type,
    p_reference_id =>
      v_reference_id,
    p_note =>
      v_note,
    p_actor_type =>
      'admin',
    p_actor_id =>
      v_actor_id,
    p_metadata =>
      jsonb_build_object(
        'authority',
          'cing_wallet_admin_adjust_balance_atomic_v1',
        'request_id',
          p_request_id::text,
        'direction',
          v_direction,
        'reason_code',
          v_reason_code
      )
  );

  return query
  select
    v_transaction.id,
    v_transaction.user_id,
    v_direction,
    p_amount,
    v_transaction.amount,
    v_transaction.balance_before,
    v_transaction.balance_after,
    v_reason_code,
    v_transaction.note,
    v_transaction.reference_type,
    v_transaction.reference_id,
    v_transaction.actor_id,
    v_transaction.created_at,
    true;
end;
$$;

revoke all
on function
  public.cing_wallet_admin_adjust_balance_atomic_v1(
    text,
    text,
    bigint,
    uuid,
    text,
    text,
    text,
    text,
    text
  )
from public;

revoke all
on function
  public.cing_wallet_admin_adjust_balance_atomic_v1(
    text,
    text,
    bigint,
    uuid,
    text,
    text,
    text,
    text,
    text
  )
from anon;

revoke all
on function
  public.cing_wallet_admin_adjust_balance_atomic_v1(
    text,
    text,
    bigint,
    uuid,
    text,
    text,
    text,
    text,
    text
  )
from authenticated;

grant execute
on function
  public.cing_wallet_admin_adjust_balance_atomic_v1(
    text,
    text,
    bigint,
    uuid,
    text,
    text,
    text,
    text,
    text
  )
to service_role;

commit;
