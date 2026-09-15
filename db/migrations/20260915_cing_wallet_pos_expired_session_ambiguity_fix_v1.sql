/*
 * CING WALLET POS — EXPIRED SESSION AMBIGUITY FIX V1
 *
 * Forward-only repair for:
 *   column reference "payment_intent_id" is ambiguous
 *
 * Root cause:
 * cing_wallet_expire_stale_manual_pos_session_private_v1()
 * RETURNS TABLE exposes payment_intent_id as a PL/pgSQL output
 * variable while the session UPDATE previously used the same
 * identifier without table qualification.
 *
 * Financial semantics are unchanged.
 */

create or replace function
public.cing_wallet_expire_stale_manual_pos_session_private_v1(
  p_pos_parent text,
  p_pos_id text
)
returns table(
  session_id uuid,
  payment_intent_id uuid,
  session_status text,
  payment_status text,
  expired boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_pos_parent text;
  v_pos_id text;

  v_session
    public.cing_wallet_pos_sessions%rowtype;

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_updated_session
    public.cing_wallet_pos_sessions%rowtype;

  v_updated_intent
    public.cing_wallet_pos_payment_intents%rowtype;
begin
  v_pos_parent :=
    nullif(
      btrim(
        coalesce(
          p_pos_parent,
          ''
        )
      ),
      ''
    );

  v_pos_id :=
    nullif(
      btrim(
        coalesce(
          p_pos_id,
          ''
        )
      ),
      ''
    );

  if v_pos_parent is null then
    raise exception
      'CING_WALLET_POS_EXPIRE_PARENT_REQUIRED'
      using errcode = '22023';
  end if;

  if v_pos_id is null then
    raise exception
      'CING_WALLET_POS_EXPIRE_POS_ID_REQUIRED'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_pos_parent
      || ':'
      || v_pos_id,
      0
    )
  );

  select s.*
  into v_session
  from public.cing_wallet_pos_sessions as s
  where s.pos_parent =
      v_pos_parent
    and s.pos_id =
      v_pos_id
    and s.session_origin in (
      'cashier_manual',
      'ipos_api'
    )
    and s.status =
      'qr_ready'
  order by
    s.created_at desc
  limit 1
  for update;

  if not found then
    return;
  end if;

  if v_session.payment_intent_id is null then
    raise exception
      'CING_WALLET_POS_EXPIRE_INTENT_REQUIRED'
      using errcode = '55000';
  end if;

  select i.*
  into v_intent
  from public.cing_wallet_pos_payment_intents as i
  where i.id =
    v_session.payment_intent_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_EXPIRE_INTENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_intent.pos_parent <>
      v_session.pos_parent
    or v_intent.pos_id <>
      v_session.pos_id
    or v_intent.bill_reference
      is distinct from
      v_session.sale_tran_id
    or v_intent.amount <>
      v_session.amount
  then
    raise exception
      'CING_WALLET_POS_EXPIRE_INTENT_MISMATCH'
      using errcode = '55000';
  end if;

  if v_intent.status = 'paid'
    or v_intent.customer_user_id is not null
    or v_intent.wallet_transaction_id is not null
    or v_intent.paid_at is not null
  then
    raise exception
      'CING_WALLET_POS_EXPIRE_FINANCIAL_PROOF_PRESENT'
      using errcode = '55000';
  end if;

  if v_intent.status = 'pending'
    and v_intent.expires_at > v_now
  then
    return query
    select
      v_session.id,
      v_intent.id,
      v_session.status,
      v_intent.status,
      false;

    return;
  end if;

  if v_intent.status not in (
    'pending',
    'expired'
  )
  then
    raise exception
      'CING_WALLET_POS_EXPIRE_INTENT_STATE_INVALID'
      using errcode = '55000';
  end if;

  if v_intent.status = 'pending'
    and v_intent.expires_at > v_now
  then
    raise exception
      'CING_WALLET_POS_EXPIRE_NOT_DUE'
      using errcode = '55000';
  end if;

  if v_intent.status = 'pending' then
    update public.cing_wallet_pos_payment_intents as target_intent
    set
      status =
        'expired',
      updated_at =
        v_now
    where target_intent.id =
        v_intent.id
      and target_intent.status =
        'pending'
      and target_intent.expires_at <=
        v_now
      and target_intent.customer_user_id is null
      and target_intent.wallet_transaction_id is null
      and target_intent.paid_at is null
    returning target_intent.*
    into v_updated_intent;

    if v_updated_intent.id is null then
      raise exception
        'CING_WALLET_POS_EXPIRE_INTENT_RACE'
        using errcode = '40001';
    end if;

    v_intent :=
      v_updated_intent;
  end if;

  update public.cing_wallet_pos_sessions as target_session
  set
    status =
      'expired',
    updated_at =
      v_now
  where target_session.id =
      v_session.id
    and target_session.status =
      'qr_ready'
    and target_session.payment_intent_id =
      v_intent.id
  returning target_session.*
  into v_updated_session;

  if v_updated_session.id is null then
    raise exception
      'CING_WALLET_POS_EXPIRE_SESSION_RACE'
      using errcode = '40001';
  end if;

  insert into
  public.cing_wallet_pos_session_audit (
    session_id,
    event_type,
    actor_type,
    actor_id,
    event_fingerprint,
    payload
  )
  values (
    v_updated_session.id,
    'SESSION_EXPIRED',
    'system',
    null,
    'intent_expired:'
      || v_intent.id::text,
    jsonb_build_object(
      'payment_intent_id',
      v_intent.id,
      'payment_status',
      v_intent.status,
      'expires_at',
      v_intent.expires_at,
      'pos_parent',
      v_updated_session.pos_parent,
      'pos_id',
      v_updated_session.pos_id,
      'amount',
      v_updated_session.amount,
      'amount_source',
      v_updated_session.amount_source
    )
  )
  on conflict do nothing;

  return query
  select
    v_updated_session.id,
    v_intent.id,
    v_updated_session.status,
    v_intent.status,
    true;
end;
$$;

revoke all on function
public.cing_wallet_expire_stale_manual_pos_session_private_v1(
  text,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_expire_stale_manual_pos_session_private_v1(
  text,
  text
)
to service_role;
