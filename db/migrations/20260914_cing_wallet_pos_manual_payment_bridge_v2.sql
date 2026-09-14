begin;

/*
 * CING WALLET POS — MANUAL PAYMENT BRIDGE V2
 *
 * Latency-sensitive cashier critical path:
 *
 * one PostgreSQL RPC:
 *   1. create/replay manual POS session
 *   2. create/replay canonical POS payment intent
 *   3. link exact intent to exact session
 *
 * Then backend signs qr_content locally.
 *
 * NO iPOS/Foodbook call.
 * NO Wallet debit.
 * NO sale_tran_id fabrication.
 * NO Event 11 dependency.
 */

create or replace function
public.cing_wallet_prepare_manual_pos_payment_v2(
  p_pos_parent text,
  p_pos_id text,
  p_amount bigint,
  p_actor_id text,
  p_request_id uuid,
  p_expires_at timestamptz,
  p_amount_source text default 'cashier_manual'
)
returns table (
  session_id uuid,
  payment_intent_id uuid,
  payment_token_id uuid,
  provider_request_key text,
  pos_parent text,
  pos_id text,
  sale_tran_id text,
  amount bigint,
  amount_source text,
  session_status text,
  payment_status text,
  expires_at timestamptz,
  created_session boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;

  v_intent record;

  v_link record;

  v_provider_request_key text;
begin
  /*
   * Manual session creation owns:
   * - input validation
   * - per-POS advisory lock
   * - one-active-session fence
   * - idempotent request_id replay
   * - immutable frozen amount
   */
  select *
  into v_session
  from public.cing_wallet_create_manual_pos_session_v2(
    p_pos_parent,
    p_pos_id,
    p_amount,
    p_actor_id,
    p_request_id,
    p_amount_source
  );

  if v_session.session_id is null then
    raise exception
      'CING_WALLET_POS_MANUAL_SESSION_RESULT_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Session UUID is the pre-bill payment identity.
   *
   * It is NOT an iPOS sale_tran_id.
   * sale_tran_id remains NULL until Event 11.
   */
  v_provider_request_key :=
    'ipos:'
      || v_session.pos_parent
      || ':'
      || v_session.pos_id
      || ':session:'
      || v_session.session_id::text;

  /*
   * Reuse the already-proven canonical payment intent
   * authority.
   *
   * bill_reference intentionally remains NULL before
   * Event 11.
   */
  select *
  into v_intent
  from public.cing_wallet_create_pos_payment_intent_v1(
    v_provider_request_key,
    v_session.pos_parent,
    v_session.pos_id,
    null,
    v_session.amount,
    p_expires_at,
    jsonb_build_object(
      'payment_origin',
        'manual_pos_counter',
      'pos_session_id',
        v_session.session_id,
      'amount_source',
        v_session.amount_source,
      'manual_request_id',
        v_session.manual_request_id
    )
  );

  if v_intent.intent_id is null
     or v_intent.payment_token_id is null
     or v_intent.expires_at is null
  then
    raise exception
      'CING_WALLET_POS_MANUAL_INTENT_RESULT_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Existing link authority verifies:
   * - exact POS identity
   * - exact amount
   * - bill_reference IS NOT DISTINCT FROM sale_tran_id
   *
   * Manual flow currently has NULL / NULL here.
   */
  select *
  into v_link
  from public.cing_wallet_link_pos_session_payment_intent_v1(
    v_session.session_id,
    v_intent.intent_id
  );

  if v_link.payment_intent_id is distinct from
       v_intent.intent_id
  then
    raise exception
      'CING_WALLET_POS_MANUAL_LINK_RESULT_INVALID'
      using errcode = '55000';
  end if;

  return query
  select
    v_session.session_id,
    v_intent.intent_id,
    v_intent.payment_token_id,
    v_intent.provider_request_key,
    v_session.pos_parent,
    v_session.pos_id,
    v_session.sale_tran_id,
    v_session.amount,
    v_session.amount_source,
    v_link.status,
    v_intent.status,
    v_intent.expires_at,
    v_session.created;
end;
$$;

revoke all on function
public.cing_wallet_prepare_manual_pos_payment_v2(
  text,
  text,
  bigint,
  text,
  uuid,
  timestamptz,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_prepare_manual_pos_payment_v2(
  text,
  text,
  bigint,
  text,
  uuid,
  timestamptz,
  text
)
to service_role;


/*
 * Structural assertion.
 */
do $$
begin
  if to_regprocedure(
    'public.cing_wallet_prepare_manual_pos_payment_v2(text,text,bigint,text,uuid,timestamp with time zone,text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_MANUAL_PAYMENT_BRIDGE_MISSING';
  end if;
end;
$$;

commit;
