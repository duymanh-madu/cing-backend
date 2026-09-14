/*
 * CING WALLET POS — EXPIRED SESSION REAPER V1
 *
 * Purpose:
 * - autonomously release stale merchant QR slots;
 * - reuse the canonical per-POS lifecycle authority;
 * - remain safe under multiple backend instances;
 * - never mutate Wallet balance, ledger, loyalty points,
 *   settlement evidence, or reconciliation evidence.
 */

create or replace function
public.cing_wallet_expire_stale_manual_pos_sessions_batch_v1(
  p_limit integer default 50
)
returns table(
  scanned integer,
  expired integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_candidate record;
  v_result record;
  v_scanned integer := 0;
  v_expired integer := 0;
begin
  v_limit := least(
    greatest(coalesce(p_limit, 50), 1),
    100
  );

  /*
   * Global non-blocking run fence.
   *
   * Every Railway instance may boot the worker. Only one batch
   * owns a reaper pass at a time; another instance simply returns.
   */
  if not pg_try_advisory_xact_lock(
    hashtextextended(
      'cing_wallet_pos_expired_session_reaper_v1',
      0
    )
  ) then
    return query
    select 0, 0;
    return;
  end if;

  /*
   * Discovery is deliberately narrower than lifecycle authority:
   * - manual/API merchant QR only;
   * - session still qr_ready;
   * - linked intent only;
   * - intent pending/expired;
   * - no customer/financial proof;
   * - pending QR must already be past immutable expiry.
   *
   * The private lifecycle helper re-locks the POS/session/intent
   * and re-validates all canonical identity and financial fences.
   */
  for v_candidate in
    select
      s.pos_parent,
      s.pos_id
    from public.cing_wallet_pos_sessions s
    join public.cing_wallet_pos_payment_intents i
      on i.id = s.payment_intent_id
    where s.session_origin in (
      'cashier_manual',
      'ipos_api'
    )
      and s.status = 'qr_ready'
      and s.payment_intent_id is not null
      and i.status in (
        'pending',
        'expired'
      )
      and i.customer_user_id is null
      and i.wallet_transaction_id is null
      and i.paid_at is null
      and (
        i.status = 'expired'
        or (
          i.status = 'pending'
          and i.expires_at <= clock_timestamp()
        )
      )
    order by i.expires_at asc, s.created_at asc
    limit v_limit
  loop
    v_scanned := v_scanned + 1;

    select *
    into v_result
    from public.cing_wallet_expire_stale_manual_pos_session_private_v1(
      v_candidate.pos_parent,
      v_candidate.pos_id
    );

    if found and coalesce(v_result.expired, false) then
      v_expired := v_expired + 1;
    end if;
  end loop;

  return query
  select v_scanned, v_expired;
end;
$$;

revoke all on function
public.cing_wallet_expire_stale_manual_pos_sessions_batch_v1(integer)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_expire_stale_manual_pos_sessions_batch_v1(integer)
to service_role;
