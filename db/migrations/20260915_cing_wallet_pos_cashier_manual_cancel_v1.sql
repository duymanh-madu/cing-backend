begin;

/*
 * CING WALLET POS — CASHIER MANUAL CANCEL V1
 *
 * Purpose:
 * Allow an authenticated cashier to terminalize an
 * unsettled manual Cing Pay session belonging to the
 * cashier's bound store/POS.
 *
 * Financial invariant:
 * - no Wallet mutation
 * - no refund
 * - no loyalty points
 * - no spending credit
 * - no rewards
 * - no Event 11
 * - no DELETE
 *
 * Terminal states remain distinct:
 * - cashier cancel => cancelled
 * - TTL lifecycle => expired
 * - settlement => paid
 */

create or replace function
public.cing_wallet_cancel_manual_pos_session_v1(
  p_actor_admin_id text,
  p_session_id uuid,
  p_cancel_request_id uuid,
  p_reason text
)
returns table(
  session_id uuid,
  payment_intent_id uuid,
  session_status text,
  payment_status text,
  cancelled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_actor_id text;

  v_reason text;

  v_store record;

  v_session
    public.cing_wallet_pos_sessions%rowtype;

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_updated_session
    public.cing_wallet_pos_sessions%rowtype;

  v_updated_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_fingerprint text;
begin
  v_actor_id :=
    nullif(
      btrim(
        coalesce(
          p_actor_admin_id,
          ''
        )
      ),
      ''
    );

  v_reason :=
    nullif(
      btrim(
        coalesce(
          p_reason,
          ''
        )
      ),
      ''
    );

  if v_actor_id is null then
    raise exception
      'CING_WALLET_POS_CANCEL_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  if p_session_id is null then
    raise exception
      'CING_WALLET_POS_CANCEL_SESSION_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_cancel_request_id is null then
    raise exception
      'CING_WALLET_POS_CANCEL_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if v_reason is null then
    raise exception
      'CING_WALLET_POS_CANCEL_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  /*
   * Resolve store/POS only from authenticated admin.
   * Browser never owns POS identity.
   */
  select *
  into v_store
  from
    public.cing_wallet_resolve_counter_store_v1(
      v_actor_id
    );

  if not found then
    raise exception
      'CING_WALLET_POS_CANCEL_STORE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Same per-POS serialization domain as create/expiry.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_store.pos_parent
      || ':'
      || v_store.pos_id,
      0
    )
  );

  select s.*
  into v_session
  from public.cing_wallet_pos_sessions as s
  where s.id =
      p_session_id
    and s.pos_parent =
      v_store.pos_parent
    and s.pos_id =
      v_store.pos_id
    and s.session_origin =
    'cashier_manual'
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_CANCEL_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  v_fingerprint :=
    'cashier_cancel:'
    || p_cancel_request_id::text;

  /*
   * Exact idempotent replay.
   * Request identity is durable in append-only audit.
   */
  if exists (
    select 1
    from
      public.cing_wallet_pos_session_audit as a
    where a.session_id =
        v_session.id
      and a.event_type =
        'SESSION_CANCELLED'
      and a.event_fingerprint =
        v_fingerprint
      and a.actor_type =
        'cashier'
      and a.actor_id =
        v_actor_id
      and coalesce(
        a.payload ->> 'reason',
        ''
      ) =
        v_reason
  ) then
    if v_session.status <>
        'cancelled'
    then
      raise exception
        'CING_WALLET_POS_CANCEL_REPLAY_STATE_MISMATCH'
        using errcode = '55000';
    end if;

    if v_session.payment_intent_id is not null then
      select i.*
      into v_intent
      from
        public.cing_wallet_pos_payment_intents as i
      where i.id =
        v_session.payment_intent_id;

      if not found
        or v_intent.status <>
          'cancelled'
        or v_intent.customer_user_id is not null
        or v_intent.wallet_transaction_id is not null
        or v_intent.paid_at is not null
      then
        raise exception
          'CING_WALLET_POS_CANCEL_REPLAY_INTENT_MISMATCH'
          using errcode = '55000';
      end if;
    end if;

    return query
    select
      v_session.id,
      v_session.payment_intent_id,
      v_session.status,
      case
        when v_session.payment_intent_id is null
          then null::text
        else v_intent.status
      end,
      true;

    return;
  end if;

  /*
   * cancel_request_id is command identity, not merely
   * per-session metadata.
   *
   * Once a cancellation fingerprint exists anywhere,
   * it may only be replayed against the exact original
   * session + actor + reason handled above.
   *
   * Reuse against another session, actor, or payload
   * fails closed.
   */
  if exists (
    select 1
    from
      public.cing_wallet_pos_session_audit as a
    where a.event_type =
        'SESSION_CANCELLED'
      and a.event_fingerprint =
        v_fingerprint
  ) then
    raise exception
      'CING_WALLET_POS_CANCEL_REPLAY_PAYLOAD_MISMATCH'
      using errcode = '55000';
  end if;

  /*
   * Different request may not rewrite an already
   * terminalized session.
   */
  if v_session.status =
      'cancelled'
  then
    raise exception
      'CING_WALLET_POS_CANCEL_ALREADY_CANCELLED'
      using errcode = '55000';
  end if;

  if v_session.status not in (
    'amount_frozen',
    'qr_ready'
  )
  then
    raise exception
      'CING_WALLET_POS_CANCEL_SESSION_STATE_INVALID'
      using errcode = '55000';
  end if;

  /*
   * amount_frozen has no payment intent by canonical
   * session constraint.
   */
  if v_session.status =
      'amount_frozen'
  then
    if v_session.payment_intent_id is not null then
      raise exception
        'CING_WALLET_POS_CANCEL_UNEXPECTED_INTENT'
        using errcode = '55000';
    end if;
  else
    /*
     * qr_ready must own one exact pending intent.
     */
    if v_session.payment_intent_id is null then
      raise exception
        'CING_WALLET_POS_CANCEL_INTENT_REQUIRED'
        using errcode = '55000';
    end if;

    select i.*
    into v_intent
    from
      public.cing_wallet_pos_payment_intents as i
    where i.id =
      v_session.payment_intent_id
    for update;

    if not found then
      raise exception
        'CING_WALLET_POS_CANCEL_INTENT_NOT_FOUND'
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
        'CING_WALLET_POS_CANCEL_INTENT_MISMATCH'
        using errcode = '55000';
    end if;

    /*
     * Absolute financial/customer fence.
     */
    if v_intent.status =
        'paid'
      or v_intent.customer_user_id is not null
      or v_intent.wallet_transaction_id is not null
      or v_intent.paid_at is not null
    then
      raise exception
        'CING_WALLET_POS_CANCEL_FINANCIAL_PROOF_PRESENT'
        using errcode = '55000';
    end if;

    if v_intent.status <>
        'pending'
    then
      raise exception
        'CING_WALLET_POS_CANCEL_INTENT_STATE_INVALID'
        using errcode = '55000';
    end if;

    update
      public.cing_wallet_pos_payment_intents
        as target_intent
    set
      status =
        'cancelled',
      updated_at =
        v_now
    where target_intent.id =
        v_intent.id
      and target_intent.status =
        'pending'
      and target_intent.customer_user_id is null
      and target_intent.wallet_transaction_id is null
      and target_intent.paid_at is null
    returning target_intent.*
    into v_updated_intent;

    if v_updated_intent.id is null then
      raise exception
        'CING_WALLET_POS_CANCEL_INTENT_RACE'
        using errcode = '40001';
    end if;

    v_intent :=
      v_updated_intent;
  end if;

  update
    public.cing_wallet_pos_sessions
      as target_session
  set
    status =
      'cancelled',
    updated_at =
      v_now
  where target_session.id =
      v_session.id
    and target_session.status =
      v_session.status
    and target_session.pos_parent =
      v_store.pos_parent
    and target_session.pos_id =
      v_store.pos_id
  returning target_session.*
  into v_updated_session;

  if v_updated_session.id is null then
    raise exception
      'CING_WALLET_POS_CANCEL_SESSION_RACE'
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
    'SESSION_CANCELLED',
    'cashier',
    v_actor_id,
    v_fingerprint,
    jsonb_build_object(
      'request_id',
      p_cancel_request_id,
      'reason',
      v_reason,
      'previous_status',
      v_session.status,
      'payment_intent_id',
      v_updated_session.payment_intent_id,
      'payment_status',
      case
        when v_updated_session.payment_intent_id
          is null
          then null
        else v_intent.status
      end,
      'pos_parent',
      v_updated_session.pos_parent,
      'pos_id',
      v_updated_session.pos_id,
      'amount',
      v_updated_session.amount,
      'amount_source',
      v_updated_session.amount_source
    )
  );

  return query
  select
    v_updated_session.id,
    v_updated_session.payment_intent_id,
    v_updated_session.status,
    case
      when v_updated_session.payment_intent_id
        is null
        then null::text
      else v_intent.status
    end,
    true;
end;
$$;

revoke all on function
public.cing_wallet_cancel_manual_pos_session_v1(
  text,
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_cancel_manual_pos_session_v1(
  text,
  uuid,
  uuid,
  text
)
to service_role;

commit;
