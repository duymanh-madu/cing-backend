/*
 * ==========================================================
 * CING WALLET POS — EXPIRED MANUAL SESSION LIFECYCLE V1
 * ==========================================================
 *
 * Root cause:
 *
 * A POS payment intent can become expired while its linked
 * cing_wallet_pos_sessions row remains qr_ready.
 *
 * The stale qr_ready row continues occupying the per-POS
 * active-session unique slot and the Counter continues seeing
 * a dead QR as an active session.
 *
 * Authority added here:
 *
 * 1. Normalize one stale manual/API QR session atomically.
 * 2. Never mutate Wallet balance or Wallet ledger.
 * 3. Never expire paid/customer-bound/Wallet-linked evidence.
 * 4. Synchronize already-expired intent -> expired session.
 * 5. Synchronize time-expired pending intent + session together.
 * 6. Append one durable SESSION_EXPIRED audit event.
 * 7. Reuse the same per-POS advisory transaction fence used by
 *    manual-session creation.
 * 8. Current-session polling normalizes stale lifecycle before
 *    returning the active session.
 * 9. New manual-session creation normalizes stale lifecycle
 *    before testing the active-POS slot.
 */


/*
 * ==========================================================
 * PRIVATE STALE SESSION NORMALIZER
 * ==========================================================
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

  /*
   * Same transaction fence as canonical manual-session create.
   *
   * This prevents:
   * - stale expiry racing new session creation;
   * - current-session polling racing new session creation;
   * - two normalizers terminalizing the same row differently.
   */
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
  from public.cing_wallet_pos_sessions s
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
  from public.cing_wallet_pos_payment_intents i
  where i.id =
    v_session.payment_intent_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_EXPIRE_INTENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Immutable identity fence.
   */
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

  /*
   * A session carrying any settlement/customer proof is not a
   * stale anonymous QR and must never be auto-terminalized.
   */
  if v_intent.status = 'paid'
    or v_intent.customer_user_id is not null
    or v_intent.wallet_transaction_id is not null
    or v_intent.paid_at is not null
  then
    raise exception
      'CING_WALLET_POS_EXPIRE_FINANCIAL_PROOF_PRESENT'
      using errcode = '55000';
  end if;

  /*
   * Still-live pending QR => no lifecycle transition.
   */
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

  /*
   * Only two canonical stale forms are accepted:
   *
   * A. pending + frozen expiry has elapsed
   * B. intent has already been marked expired by another
   *    canonical intent read/query authority, while the session
   *    projection is still qr_ready.
   *
   * cancelled or unknown states fail closed.
   */
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

  /*
   * If the intent is still pending, terminalize it first while
   * holding both row locks.
   */
  if v_intent.status = 'pending' then
    update public.cing_wallet_pos_payment_intents
    set
      status =
        'expired',
      updated_at =
        v_now
    where id =
        v_intent.id
      and status =
        'pending'
      and expires_at <=
        v_now
      and customer_user_id is null
      and wallet_transaction_id is null
      and paid_at is null
    returning *
    into v_updated_intent;

    if v_updated_intent.id is null then
      raise exception
        'CING_WALLET_POS_EXPIRE_INTENT_RACE'
        using errcode = '40001';
    end if;

    v_intent :=
      v_updated_intent;
  end if;

  /*
   * Session projection is terminalized in the same PostgreSQL
   * transaction. This releases the active-POS partial unique
   * slot without deleting or rewriting payment evidence.
   */
  update public.cing_wallet_pos_sessions
  set
    status =
      'expired',
    updated_at =
      v_now
  where id =
      v_session.id
    and status =
      'qr_ready'
    and payment_intent_id =
      v_intent.id
  returning *
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


/*
 * Private/backend execution only.
 */
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


/*
 * ==========================================================
 * CURRENT MANUAL SESSION — LIFECYCLE-AWARE OVERRIDE
 * ==========================================================
 *
 * Preserve:
 * - one actor-bound PostgreSQL RPC from Node;
 * - canonical store resolution inside PostgreSQL;
 * - Event2 exclusion;
 * - at most one current row;
 * - no Wallet financial mutation.
 *
 * New:
 * - normalize stale linked QR before reading current session.
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

  /*
   * Lifecycle normalization is deliberately inside this single
   * PostgreSQL authority. Node/browser still performs exactly
   * one RPC call per current-session poll.
   */
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
      'qr_ready',
      'paid',
      'reconciliation_pending'
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
 * ==========================================================
 * MANUAL SESSION CREATE — STALE SLOT NORMALIZATION
 * ==========================================================
 *
 * Preserve the exact public signature because
 * prepare_manual_pos_payment_v2/v3 already depend on it.
 *
 * The only lifecycle change is that after acquiring the same
 * per-POS transaction fence, a stale qr_ready linked intent is
 * normalized before the busy-slot check.
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
      'paid',
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
