begin;

/*
 * CING WALLET POS
 * SETTLED-UNRECONCILED SLOT RELEASE V1
 *
 * Separate two independent lifecycles:
 *
 *   PAYMENT:
 *     amount_frozen -> qr_ready -> Wallet settled
 *
 *   RECONCILIATION:
 *     pending -> matched / mismatch
 *
 * A session with canonical Wallet settlement must not keep the
 * cashier payment slot occupied merely because iPOS reconciliation
 * is still pending.
 *
 * Financial invariants:
 * - no Wallet mutation;
 * - no ledger mutation;
 * - no points/spending/reward mutation;
 * - no Event11 fabrication;
 * - no sale_tran_id fabrication;
 * - reconciliation_pending remains durable historical evidence.
 */


/*
 * ==========================================================
 * 1. ACTIVE PAYMENT SLOT
 * ==========================================================
 *
 * Only unfinished PAYMENT states occupy the POS slot.
 *
 * reconciliation_pending means Wallet settlement has already
 * completed and therefore must not block the next payment.
 */

drop index if exists
  public.cing_wallet_pos_sessions_active_payment_pos_uq;

create unique index
  cing_wallet_pos_sessions_active_payment_pos_uq
on public.cing_wallet_pos_sessions (
  pos_parent,
  pos_id
)
where
  session_origin in (
    'cashier_manual',
    'ipos_api'
  )
  and status in (
    'amount_frozen',
    'qr_ready'
  );


/*
 * ==========================================================
 * 2. MANUAL SESSION CREATE
 * ==========================================================
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

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_pos_parent
      || ':'
      || v_pos_id,
      0
    )
  );

  perform *
  from public.cing_wallet_expire_stale_manual_pos_session_private_v1(
    v_pos_parent,
    v_pos_id
  );

  /*
   * Durable request replay remains historical and immutable.
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
   * PAYMENT slot only.
   *
   * reconciliation_pending is deliberately absent: Wallet
   * settlement is already canonical in that state.
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
      'qr_ready'
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


/*
 * ==========================================================
 * 3. CURRENT CASHIER PAYMENT SESSION
 * ==========================================================
 *
 * Historical reconciliation backlog must not resurrect as the
 * cashier's current payment.
 */

create or replace function
public.cing_wallet_get_current_manual_pos_session_v1(
  p_actor_admin_id text
)
returns table(
  id uuid,
  store_id uuid,
  store_code text,
  store_display_name text,
  pos_parent text,
  pos_id text,
  sale_tran_id text,
  amount bigint,
  amount_source text,
  session_origin text,
  status text,
  payment_intent_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id text;
  v_store record;
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

  if v_actor_id is null then
    raise exception
      'CING_WALLET_POS_COUNTER_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  select *
  into v_store
  from public.cing_wallet_resolve_counter_store_v1(
    v_actor_id
  );

  perform *
  from public.cing_wallet_expire_stale_manual_pos_session_private_v1(
    v_store.pos_parent,
    v_store.pos_id
  );

  return query
  select
    ps.id,
    v_store.store_id,
    v_store.store_code,
    v_store.display_name,
    ps.pos_parent,
    ps.pos_id,
    ps.sale_tran_id,
    ps.amount,
    ps.amount_source,
    ps.session_origin,
    ps.status,
    ps.payment_intent_id,
    ps.created_at,
    ps.updated_at
  from public.cing_wallet_pos_sessions ps
  where ps.pos_parent =
      v_store.pos_parent
    and ps.pos_id =
      v_store.pos_id
    and ps.session_origin in (
      'cashier_manual',
      'ipos_api'
    )
    and ps.status in (
      'amount_frozen',
      'qr_ready'
    )
  order by
    ps.created_at desc
  limit 1;
end;
$$;

revoke all on function
public.cing_wallet_get_current_manual_pos_session_v1(
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_get_current_manual_pos_session_v1(
  text
)
to service_role;


/*
 * Event11 remains untouched deliberately.
 *
 * With multiple settled unbound historical sessions, its existing
 * candidate_count > 1 fence raises
 * CING_WALLET_POS_EVENT11_MANUAL_SESSION_AMBIGUOUS.
 *
 * Therefore no callback can silently FIFO-bind an arbitrary
 * historical payment.
 *
 * EVENT11 TRUST MUST REMAIN DISABLED until authenticated provider
 * ingress is established.
 */

commit;
