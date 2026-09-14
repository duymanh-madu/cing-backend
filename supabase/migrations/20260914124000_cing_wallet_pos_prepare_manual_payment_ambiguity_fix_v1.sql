/*
 * Cing Wallet POS — prepare manual payment ambiguity fix V1
 *
 * Root cause:
 * cing_wallet_prepare_manual_pos_payment_v3 RETURNS TABLE exposes
 * pos_parent / pos_id as PL/pgSQL output variables while its payment
 * intent UPDATE referenced target columns without qualification.
 *
 * PostgreSQL therefore raised:
 *   column reference "pos_parent" is ambiguous
 *
 * Financial semantics are unchanged.
 * This migration only qualifies payment-intent column reads.
 */

create or replace function
public.cing_wallet_prepare_manual_pos_payment_v3(
  p_actor_admin_id text,
  p_amount bigint,
  p_request_id uuid,
  p_expires_at timestamptz
)
returns table (
  session_id uuid,
  store_id uuid,
  store_code text,
  store_display_name text,
  pos_parent text,
  pos_id text,
  sale_tran_id text,
  payment_intent_id uuid,
  provider_request_key text,
  payment_token_id uuid,
  amount bigint,
  amount_source text,
  expires_at timestamptz,
  session_status text,
  payment_status text,
  created_session boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store record;
  v_prepared record;
  v_store_snapshot jsonb;

begin
  select *
  into v_store
  from public.cing_wallet_resolve_counter_store_v1(
    p_actor_admin_id
  );

  select *
  into v_prepared
  from public.cing_wallet_prepare_manual_pos_payment_v2(
    v_store.pos_parent,
    v_store.pos_id,
    p_amount,
    p_actor_admin_id,
    p_request_id,
    p_expires_at,
    'cashier_manual'
  );

  if v_prepared.session_id is null
     or v_prepared.payment_intent_id is null
     or v_prepared.payment_token_id is null
  then
    raise exception
      'CING_WALLET_POS_MANUAL_PAYMENT_V3_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Snapshot store identity in payment intent metadata.
   *
   * A7.2B will project this immutable snapshot into Wallet
   * ledger/customer history.
   */
  update public.cing_wallet_pos_payment_intents as pi
  set
    metadata =
      case
        when
          pi.metadata->>'store_id'
            is null
          and
          pi.metadata->>'store_code'
            is null
          and
          pi.metadata->>'store_display_name'
            is null
        then
          coalesce(
            pi.metadata,
            '{}'::jsonb
          )
          ||
          jsonb_build_object(
            'store_id',
              v_store.store_id,
            'store_code',
              v_store.store_code,
            'store_display_name',
              v_store.display_name
          )
        else
          pi.metadata
      end
  where pi.id =
    v_prepared.payment_intent_id
    and pi.pos_parent =
      v_store.pos_parent
    and pi.pos_id =
      v_store.pos_id
    and (
      (
        pi.metadata->>'store_id'
          is null
        and
        pi.metadata->>'store_code'
          is null
        and
        pi.metadata->>'store_display_name'
          is null
      )
      or (
        pi.metadata->>'store_id' =
          v_store.store_id::text
        and
        nullif(
          btrim(
            pi.metadata->>'store_code'
          ),
          ''
        ) is not null
        and
        nullif(
          btrim(
            pi.metadata->>'store_display_name'
          ),
          ''
        ) is not null
      )
    )
  returning
    pi.metadata
  into
    v_store_snapshot;

  if not found
     or v_store_snapshot is null
  then
    raise exception
      'CING_WALLET_POS_STORE_SNAPSHOT_CONFLICT'
      using errcode = '55000';
  end if;

  return query
  select
    v_prepared.session_id,
    (
      v_store_snapshot->>'store_id'
    )::uuid,
    v_store_snapshot->>'store_code',
    v_store_snapshot->>'store_display_name',
    v_prepared.pos_parent,
    v_prepared.pos_id,
    v_prepared.sale_tran_id,
    v_prepared.payment_intent_id,
    v_prepared.provider_request_key,
    v_prepared.payment_token_id,
    v_prepared.amount,
    v_prepared.amount_source,
    v_prepared.expires_at,
    v_prepared.session_status,
    v_prepared.payment_status,
    v_prepared.created_session;
end;
$$;

revoke all on function
public.cing_wallet_prepare_manual_pos_payment_v3(
  text,
  bigint,
  uuid,
  timestamp with time zone
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_prepare_manual_pos_payment_v3(
  text,
  bigint,
  uuid,
  timestamp with time zone
)
to service_role;
