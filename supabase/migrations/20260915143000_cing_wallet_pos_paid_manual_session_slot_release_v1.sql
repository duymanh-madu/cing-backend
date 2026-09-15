begin;

/*
 * CING WALLET POS — PAID MANUAL SESSION SLOT RELEASE V1
 *
 * A paid session is terminal financial/audit evidence.
 * It must remain immutable, but it must no longer occupy the
 * per-POS slot used to create the cashier's next transaction.
 *
 * This repair changes only the create-session busy predicate:
 *
 *   protected:
 *     amount_frozen
 *     qr_ready
 *     reconciliation_pending
 *
 *   terminal / non-blocking:
 *     paid
 *
 * No paid session or intent is updated/deleted.
 * No Wallet/ledger/points/spending/rewards/Event11 mutation.
 */

create or replace function
public.cing_wallet_create_manual_pos_session_v2(
  p_pos_parent text,
  p_pos_id text,
  p_amount bigint,
  p_actor_id text,
  p_request_id uuid,
  p_amount_source text default 'cashier_manual'
)
returns table(
  session_id uuid,
  pos_parent text,
  pos_id text,
  sale_tran_id text,
  amount bigint,
  amount_source text,
  amount_frozen_at timestamptz,
  status text,
  session_origin text,
  manual_request_id uuid,
  created boolean
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
  v_actor_id text;
  v_amount_source text;

  v_existing
    public.cing_wallet_pos_sessions%rowtype;

  v_created
    public.cing_wallet_pos_sessions%rowtype;

  v_busy
    public.cing_wallet_pos_sessions%rowtype;
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

  v_actor_id :=
    nullif(
      btrim(
        coalesce(
          p_actor_id,
          ''
        )
      ),
      ''
    );

  v_amount_source :=
    nullif(
      btrim(
        coalesce(
          p_amount_source,
          ''
        )
      ),
      ''
    );

  if v_pos_parent is null then
    raise exception
      'CING_WALLET_POS_MANUAL_PARENT_REQUIRED'
      using errcode = '22023';
  end if;

  if v_pos_id is null then
    raise exception
      'CING_WALLET_POS_MANUAL_POS_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_amount is null
    or p_amount <= 0
  then
    raise exception
      'CING_WALLET_POS_MANUAL_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  if v_actor_id is null then
    raise exception
      'CING_WALLET_POS_MANUAL_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception
      'CING_WALLET_POS_MANUAL_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if v_amount_source not in (
    'cashier_manual',
    'ipos_api'
  )
  then
    raise exception
      'CING_WALLET_POS_MANUAL_AMOUNT_SOURCE_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Canonical per-POS transaction fence.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_pos_parent
      || ':'
      || v_pos_id,
      0
    )
  );

  /*
   * Close any stale QR lifecycle before deciding whether this
   * POS is occupied.
   *
   * Advisory xact locks are re-entrant for the same session,
   * therefore the private helper safely reuses this exact fence.
   */
  perform *
  from public.cing_wallet_expire_stale_manual_pos_session_private_v1(
    v_pos_parent,
    v_pos_id
  );

  /*
   * Idempotent replay by durable request id.
   *
   * An old request remains the same historical session even if
   * it has since expired. It is never converted into a fresh QR.
   */
  select s.*
  into v_existing
  from public.cing_wallet_pos_sessions s
  where s.manual_request_id =
    p_request_id
  for update;

  if found then
    if v_existing.pos_parent <>
        v_pos_parent
      or v_existing.pos_id <>
        v_pos_id
      or v_existing.amount <>
        p_amount
      or v_existing.amount_source <>
        v_amount_source
      or v_existing.amount_entered_by <>
        v_actor_id
      or v_existing.session_origin <>
        v_amount_source
    then
      raise exception
        'CING_WALLET_POS_MANUAL_REPLAY_CONFLICT'
        using errcode = '23505';
    end if;

    return query
    select
      v_existing.id,
      v_existing.pos_parent,
      v_existing.pos_id,
      v_existing.sale_tran_id,
      v_existing.amount,
      v_existing.amount_source,
      v_existing.amount_frozen_at,
      v_existing.status,
      v_existing.session_origin,
      v_existing.manual_request_id,
      false;

    return;
  end if;

  /*
   * Any legitimate non-expired occupied state still fails
   * closed.
   */
  select s.*
  into v_busy
  from public.cing_wallet_pos_sessions s
  where s.pos_parent =
      v_pos_parent
    and s.pos_id =
      v_pos_id
    and s.session_origin in (
      'cashier_manual',
      'ipos_api'
    )
    and s.status in (
      'amount_frozen',
      'qr_ready',
      'reconciliation_pending'
    )
  limit 1
  for update;

  if found then
    raise exception
      'CING_WALLET_POS_MANUAL_POS_BUSY'
      using errcode = '55000';
  end if;

  insert into
  public.cing_wallet_pos_sessions (
    pos_parent,
    pos_id,
    sale_tran_id,
    membership_id,
    coupon_code,
    line_items_snapshot,
    event2_snapshot,
    last_event2_at,
    amount,
    amount_source,
    amount_entered_by,
    amount_entered_at,
    amount_frozen_at,
    payment_entry_mode,
    payment_intent_id,
    status,
    session_origin,
    manual_request_id,
    created_at,
    updated_at
  )
  values (
    v_pos_parent,
    v_pos_id,
    null,
    null,
    null,
    '[]'::jsonb,
    '{}'::jsonb,
    null,
    p_amount,
    v_amount_source,
    v_actor_id,
    v_now,
    v_now,
    'merchant_dynamic_qr',
    null,
    'amount_frozen',
    v_amount_source,
    p_request_id,
    v_now,
    v_now
  )
  returning *
  into v_created;

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
    v_created.id,
    'MANUAL_SESSION_CREATED',
    'cashier',
    v_actor_id,
    'manual_request:'
      || p_request_id::text,
    jsonb_build_object(
      'pos_parent',
      v_pos_parent,
      'pos_id',
      v_pos_id,
      'amount',
      p_amount,
      'amount_source',
      v_amount_source,
      'sale_tran_id',
      null,
      'request_id',
      p_request_id
    )
  )
  on conflict do nothing;

  return query
  select
    v_created.id,
    v_created.pos_parent,
    v_created.pos_id,
    v_created.sale_tran_id,
    v_created.amount,
    v_created.amount_source,
    v_created.amount_frozen_at,
    v_created.status,
    v_created.session_origin,
    v_created.manual_request_id,
    true;
end;
$$;

revoke all on function
public.cing_wallet_create_manual_pos_session_v2(
  text,
  text,
  bigint,
  text,
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_create_manual_pos_session_v2(
  text,
  text,
  bigint,
  text,
  uuid,
  text
)
to service_role;

commit;
