begin;

/*
 * ==========================================================
 * CING WALLET — POS SESSION AUTHORITY V1
 * ==========================================================
 *
 * Flow:
 *
 * iPOS Event 2
 *   -> discover/bind open POS bill
 * cashier_manual | ipos_api
 *   -> freeze authoritative payable amount
 * existing POS payment-intent authority
 *   -> create immutable amount + signed QR capability
 * customer
 *   -> authenticated atomic Wallet settlement
 * Event 11
 *   -> later reconciliation
 *
 * Financial boundary:
 *
 * - Event 2 item totals are NEVER payment authority.
 * - amount may currently come from cashier_manual.
 * - future iPOS open-bill API may use amount_source=ipos_api.
 * - amount becomes immutable once frozen.
 * - this authority does NOT debit Wallet.
 * - existing cing_wallet_settle_pos_payment_atomic_v1 remains
 *   the only POS Wallet settlement authority.
 */

create table public.cing_wallet_pos_sessions (
  id uuid
    primary key
    default gen_random_uuid(),

  pos_parent text
    not null,

  pos_id text
    not null,

  sale_tran_id text
    not null,

  membership_id text,

  coupon_code text,

  line_items_snapshot jsonb
    not null
    default '[]'::jsonb,

  event2_snapshot jsonb
    not null
    default '{}'::jsonb,

  last_event2_at timestamptz,

  amount bigint,

  amount_source text,

  amount_entered_by text,

  amount_entered_at timestamptz,

  amount_frozen_at timestamptz,

  payment_entry_mode text
    not null
    default 'merchant_dynamic_qr',

  payment_intent_id uuid
    references public.cing_wallet_pos_payment_intents(id)
    on update restrict
    on delete restrict,

  status text
    not null
    default 'awaiting_amount',

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint cing_wallet_pos_sessions_pos_parent_ck
    check (
      btrim(pos_parent) <> ''
    ),

  constraint cing_wallet_pos_sessions_pos_id_ck
    check (
      btrim(pos_id) <> ''
    ),

  constraint cing_wallet_pos_sessions_sale_tran_id_ck
    check (
      btrim(sale_tran_id) <> ''
    ),

  constraint cing_wallet_pos_sessions_amount_ck
    check (
      amount is null
      or amount > 0
    ),

  constraint cing_wallet_pos_sessions_amount_source_ck
    check (
      amount_source is null
      or amount_source in (
        'cashier_manual',
        'ipos_api'
      )
    ),

  constraint cing_wallet_pos_sessions_payment_entry_mode_ck
    check (
      payment_entry_mode in (
        'merchant_dynamic_qr',
        'ipos_native_qr'
      )
    ),

  constraint cing_wallet_pos_sessions_status_ck
    check (
      status in (
        'awaiting_amount',
        'amount_frozen',
        'qr_ready',
        'paid',
        'reconciliation_pending',
        'reconciled',
        'reconciliation_mismatch',
        'cancelled',
        'expired'
      )
    ),

  constraint cing_wallet_pos_sessions_amount_state_ck
    check (
      (
        status = 'awaiting_amount'
        and amount is null
        and amount_source is null
        and amount_frozen_at is null
      )
      or
      (
        status in (
          'amount_frozen',
          'qr_ready',
          'paid',
          'reconciliation_pending',
          'reconciled',
          'reconciliation_mismatch'
        )
        and amount is not null
        and amount_source is not null
        and amount_frozen_at is not null
      )
      or
      (
        status in (
          'cancelled',
          'expired'
        )
        and (
          (
            amount is null
            and amount_source is null
            and amount_frozen_at is null
          )
          or
          (
            amount is not null
            and amount_source is not null
            and amount_frozen_at is not null
          )
        )
      )
    ),

  constraint cing_wallet_pos_sessions_intent_state_ck
    check (
      (
        payment_intent_id is null
        and status in (
          'awaiting_amount',
          'amount_frozen',
          'cancelled',
          'expired'
        )
      )
      or
      (
        payment_intent_id is not null
        and status in (
          'qr_ready',
          'paid',
          'reconciliation_pending',
          'reconciled',
          'reconciliation_mismatch',
          'cancelled',
          'expired'
        )
      )
    )
);


create unique index
  cing_wallet_pos_sessions_bill_identity_uq
on public.cing_wallet_pos_sessions (
  pos_parent,
  pos_id,
  sale_tran_id
);


create unique index
  cing_wallet_pos_sessions_payment_intent_uq
on public.cing_wallet_pos_sessions (
  payment_intent_id
)
where payment_intent_id is not null;


create index
  cing_wallet_pos_sessions_status_created_idx
on public.cing_wallet_pos_sessions (
  status,
  created_at desc
);


create table public.cing_wallet_pos_session_audit (
  id uuid
    primary key
    default gen_random_uuid(),

  session_id uuid
    not null
    references public.cing_wallet_pos_sessions(id)
    on update restrict
    on delete restrict,

  event_type text
    not null,

  actor_type text
    not null,

  actor_id text,

  event_fingerprint text,

  payload jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now(),

  constraint cing_wallet_pos_session_audit_event_type_ck
    check (
      btrim(event_type) <> ''
    ),

  constraint cing_wallet_pos_session_audit_actor_type_ck
    check (
      actor_type in (
        'ipos',
        'cashier',
        'system',
        'customer',
        'super_admin'
      )
    ),

  constraint cing_wallet_pos_session_audit_fingerprint_ck
    check (
      event_fingerprint is null
      or btrim(event_fingerprint) <> ''
    )
);


create unique index
  cing_wallet_pos_session_audit_fingerprint_uq
on public.cing_wallet_pos_session_audit (
  session_id,
  event_type,
  event_fingerprint
)
where event_fingerprint is not null;


create index
  cing_wallet_pos_session_audit_session_created_idx
on public.cing_wallet_pos_session_audit (
  session_id,
  created_at asc
);


/*
 * Direct mutation is forbidden.
 * Backend service_role reads state and executes SECURITY DEFINER RPCs.
 */

revoke all
on table public.cing_wallet_pos_sessions
from public, anon, authenticated, service_role;

grant select
on table public.cing_wallet_pos_sessions
to service_role;


revoke all
on table public.cing_wallet_pos_session_audit
from public, anon, authenticated, service_role;

grant select
on table public.cing_wallet_pos_session_audit
to service_role;


/*
 * ==========================================================
 * EVENT 2 BILL DISCOVERY / REPLAY
 * ==========================================================
 *
 * One canonical session exists for:
 *
 *   (pos_parent, pos_id, sale_tran_id)
 *
 * Repeated Event 2 before amount freeze may refresh descriptive
 * bill snapshots because the cashier can still edit the POS bill.
 *
 * Once amount is frozen, Event 2 can no longer mutate the bill
 * snapshot used by the payment flow.
 */

create or replace function
public.cing_wallet_upsert_pos_session_from_event2_v1(
  p_pos_parent text,
  p_pos_id text,
  p_sale_tran_id text,
  p_membership_id text,
  p_coupon_code text,
  p_line_items jsonb,
  p_event_payload jsonb,
  p_event_fingerprint text
)
returns table (
  session_id uuid,
  pos_parent text,
  pos_id text,
  sale_tran_id text,
  membership_id text,
  status text,
  amount bigint,
  amount_source text,
  payment_intent_id uuid,
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
  v_sale_tran_id text;
  v_membership_id text;
  v_coupon_code text;
  v_fingerprint text;

  v_existing
    public.cing_wallet_pos_sessions%rowtype;

  v_created
    public.cing_wallet_pos_sessions%rowtype;
begin
  v_pos_parent :=
    nullif(
      btrim(p_pos_parent),
      ''
    );

  v_pos_id :=
    nullif(
      btrim(p_pos_id),
      ''
    );

  v_sale_tran_id :=
    nullif(
      btrim(p_sale_tran_id),
      ''
    );

  v_membership_id :=
    nullif(
      btrim(
        coalesce(
          p_membership_id,
          ''
        )
      ),
      ''
    );

  v_coupon_code :=
    nullif(
      btrim(
        coalesce(
          p_coupon_code,
          ''
        )
      ),
      ''
    );

  v_fingerprint :=
    nullif(
      btrim(
        coalesce(
          p_event_fingerprint,
          ''
        )
      ),
      ''
    );

  if v_pos_parent is null then
    raise exception
      'CING_WALLET_POS_SESSION_PARENT_REQUIRED'
      using errcode = '22023';
  end if;

  if v_pos_id is null then
    raise exception
      'CING_WALLET_POS_SESSION_POS_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if v_sale_tran_id is null then
    raise exception
      'CING_WALLET_POS_SESSION_TRAN_ID_REQUIRED'
      using errcode = '22023';
  end if;

  /*
   * First-create concurrency fence.
   *
   * Do NOT SELECT-first for a row that may not exist:
   * FOR UPDATE cannot lock a missing row.
   *
   * The canonical bill unique index arbitrates concurrent
   * Event 2 deliveries. Exactly one transaction inserts.
   * A contender waits for the conflicting insert to resolve,
   * receives no RETURNING row, then re-reads/locks the
   * canonical session below.
   */
  insert into public.cing_wallet_pos_sessions (
    pos_parent,
    pos_id,
    sale_tran_id,
    membership_id,
    coupon_code,
    line_items_snapshot,
    event2_snapshot,
    last_event2_at
  )
  values (
    v_pos_parent,
    v_pos_id,
    v_sale_tran_id,
    v_membership_id,
    v_coupon_code,
    coalesce(
      p_line_items,
      '[]'::jsonb
    ),
    coalesce(
      p_event_payload,
      '{}'::jsonb
    ),
    v_now
  )
  on conflict (
    pos_parent,
    pos_id,
    sale_tran_id
  )
  do nothing
  returning *
  into v_created;

  if v_created.id is not null then
    insert into public.cing_wallet_pos_session_audit (
      session_id,
      event_type,
      actor_type,
      actor_id,
      event_fingerprint,
      payload
    )
    values (
      v_created.id,
      'EVENT2_RECEIVED',
      'ipos',
      v_pos_id,
      v_fingerprint,
      jsonb_build_object(
        'pos_parent',
          v_pos_parent,
        'pos_id',
          v_pos_id,
        'sale_tran_id',
          v_sale_tran_id,
        'membership_id',
          v_membership_id,
        'coupon_code',
          v_coupon_code
      )
    )
    on conflict do nothing;

    return query
    select
      v_created.id,
      v_created.pos_parent,
      v_created.pos_id,
      v_created.sale_tran_id,
      v_created.membership_id,
      v_created.status,
      v_created.amount,
      v_created.amount_source,
      v_created.payment_intent_id,
      true;

    return;
  end if;

  /*
   * Conflict path:
   *
   * At READ COMMITTED this statement receives a fresh
   * snapshot after ON CONFLICT has resolved. Lock the
   * canonical session before refreshing descriptive Event 2
   * data.
   */
  select s.*
  into v_existing
  from public.cing_wallet_pos_sessions s
  where s.pos_parent =
      v_pos_parent
    and s.pos_id =
      v_pos_id
    and s.sale_tran_id =
      v_sale_tran_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_SESSION_CONFLICT_ROW_MISSING'
      using errcode = '40001';
  end if;

  /*
   * Event 2 may refresh descriptive discovery data only
   * while amount has not been frozen.
   *
   * Once financial state advances, repeated callbacks are
   * audit-only and cannot rewrite the bill snapshot used by
   * the cashier flow.
   */
  if v_existing.status =
    'awaiting_amount'
  then
    update public.cing_wallet_pos_sessions
    set
      membership_id =
        coalesce(
          v_membership_id,
          membership_id
        ),
      coupon_code =
        coalesce(
          v_coupon_code,
          coupon_code
        ),
      line_items_snapshot =
        coalesce(
          p_line_items,
          '[]'::jsonb
        ),
      event2_snapshot =
        coalesce(
          p_event_payload,
          '{}'::jsonb
        ),
      last_event2_at =
        v_now,
      updated_at =
        v_now
    where id =
      v_existing.id
    returning *
    into v_existing;
  end if;

  insert into public.cing_wallet_pos_session_audit (
    session_id,
    event_type,
    actor_type,
    actor_id,
    event_fingerprint,
    payload
  )
  values (
    v_existing.id,
    case
      when v_existing.status =
        'awaiting_amount'
        then 'EVENT2_RECEIVED'
      else 'EVENT2_REPLAY_AFTER_AMOUNT_FREEZE'
    end,
    'ipos',
    v_pos_id,
    v_fingerprint,
    jsonb_build_object(
      'pos_parent',
        v_pos_parent,
      'pos_id',
        v_pos_id,
      'sale_tran_id',
        v_sale_tran_id,
      'membership_id',
        v_membership_id,
      'coupon_code',
        v_coupon_code
    )
  )
  on conflict do nothing;

  return query
  select
    v_existing.id,
    v_existing.pos_parent,
    v_existing.pos_id,
    v_existing.sale_tran_id,
    v_existing.membership_id,
    v_existing.status,
    v_existing.amount,
    v_existing.amount_source,
    v_existing.payment_intent_id,
    false;
end;
$$;


/*
 * ==========================================================
 * FREEZE PAYABLE AMOUNT
 * ==========================================================
 *
 * Phase 1:
 *   p_amount_source = cashier_manual
 *
 * Future:
 *   p_amount_source = ipos_api
 *
 * Same amount/source replay is idempotent.
 * A different amount after freeze fails closed.
 */

create or replace function
public.cing_wallet_freeze_pos_session_amount_v1(
  p_session_id uuid,
  p_amount bigint,
  p_amount_source text,
  p_actor_id text
)
returns table (
  session_id uuid,
  amount bigint,
  amount_source text,
  status text,
  amount_frozen_at timestamptz,
  payment_intent_id uuid,
  applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_source text;
  v_actor_id text;

  v_session
    public.cing_wallet_pos_sessions%rowtype;
begin
  if p_session_id is null then
    raise exception
      'CING_WALLET_POS_SESSION_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_amount is null
     or p_amount <= 0
  then
    raise exception
      'CING_WALLET_POS_SESSION_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  v_source :=
    nullif(
      btrim(
        coalesce(
          p_amount_source,
          ''
        )
      ),
      ''
    );

  if v_source not in (
    'cashier_manual',
    'ipos_api'
  )
  then
    raise exception
      'CING_WALLET_POS_SESSION_AMOUNT_SOURCE_INVALID'
      using errcode = '22023';
  end if;

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

  if v_actor_id is null then
    raise exception
      'CING_WALLET_POS_SESSION_AMOUNT_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  select s.*
  into v_session
  from public.cing_wallet_pos_sessions s
  where s.id =
    p_session_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_session.status =
    'awaiting_amount'
  then
    update public.cing_wallet_pos_sessions
    set
      amount =
        p_amount,
      amount_source =
        v_source,
      amount_entered_by =
        v_actor_id,
      amount_entered_at =
        v_now,
      amount_frozen_at =
        v_now,
      status =
        'amount_frozen',
      updated_at =
        v_now
    where id =
      v_session.id
    returning *
    into v_session;

    insert into public.cing_wallet_pos_session_audit (
      session_id,
      event_type,
      actor_type,
      actor_id,
      event_fingerprint,
      payload
    )
    values (
      v_session.id,
      'AMOUNT_FROZEN',
      case
        when v_source =
          'cashier_manual'
          then 'cashier'
        else 'system'
      end,
      v_actor_id,
      'amount:'
        || p_amount::text
        || ':'
        || v_source,
      jsonb_build_object(
        'amount',
          p_amount,
        'amount_source',
          v_source
      )
    )
    on conflict do nothing;

    return query
    select
      v_session.id,
      v_session.amount,
      v_session.amount_source,
      v_session.status,
      v_session.amount_frozen_at,
      v_session.payment_intent_id,
      true;

    return;
  end if;

  if v_session.amount =
      p_amount
     and v_session.amount_source =
      v_source
     and v_session.status in (
       'amount_frozen',
       'qr_ready',
       'paid',
       'reconciliation_pending',
       'reconciled',
       'reconciliation_mismatch'
     )
  then
    return query
    select
      v_session.id,
      v_session.amount,
      v_session.amount_source,
      v_session.status,
      v_session.amount_frozen_at,
      v_session.payment_intent_id,
      false;

    return;
  end if;

  if v_session.amount is not null then
    raise exception
      'CING_WALLET_POS_SESSION_AMOUNT_IMMUTABLE'
      using errcode = '55000';
  end if;

  raise exception
    'CING_WALLET_POS_SESSION_NOT_AMOUNT_PAYABLE'
    using errcode = '55000';
end;
$$;


/*
 * ==========================================================
 * LINK EXISTING PAYMENT INTENT
 * ==========================================================
 *
 * Node creates the existing canonical payment intent only after
 * amount freeze succeeds, then links it here.
 *
 * Crash recovery is safe:
 *
 * - frozen session remains durable
 * - createIposPosPayment is itself idempotent
 * - linking the same intent is idempotent
 */

create or replace function
public.cing_wallet_link_pos_session_payment_intent_v1(
  p_session_id uuid,
  p_payment_intent_id uuid
)
returns table (
  session_id uuid,
  payment_intent_id uuid,
  amount bigint,
  status text,
  applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_session
    public.cing_wallet_pos_sessions%rowtype;

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;
begin
  if p_session_id is null then
    raise exception
      'CING_WALLET_POS_SESSION_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_payment_intent_id is null then
    raise exception
      'CING_WALLET_POS_SESSION_INTENT_ID_REQUIRED'
      using errcode = '22023';
  end if;

  select s.*
  into v_session
  from public.cing_wallet_pos_sessions s
  where s.id =
    p_session_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_session.payment_intent_id is not null then
    if v_session.payment_intent_id =
      p_payment_intent_id
    then
      return query
      select
        v_session.id,
        v_session.payment_intent_id,
        v_session.amount,
        v_session.status,
        false;

      return;
    end if;

    raise exception
      'CING_WALLET_POS_SESSION_INTENT_IMMUTABLE'
      using errcode = '55000';
  end if;

  if v_session.status <>
    'amount_frozen'
  then
    raise exception
      'CING_WALLET_POS_SESSION_AMOUNT_NOT_FROZEN'
      using errcode = '55000';
  end if;

  select i.*
  into v_intent
  from public.cing_wallet_pos_payment_intents i
  where i.id =
    p_payment_intent_id;

  if not found then
    raise exception
      'CING_WALLET_POS_SESSION_INTENT_NOT_FOUND'
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
      'CING_WALLET_POS_SESSION_INTENT_MISMATCH'
      using errcode = '55000';
  end if;

  update public.cing_wallet_pos_sessions
  set
    payment_intent_id =
      v_intent.id,
    status =
      'qr_ready',
    updated_at =
      v_now
  where id =
    v_session.id
  returning *
  into v_session;

  insert into public.cing_wallet_pos_session_audit (
    session_id,
    event_type,
    actor_type,
    actor_id,
    event_fingerprint,
    payload
  )
  values (
    v_session.id,
    'PAYMENT_INTENT_LINKED',
    'system',
    null,
    'intent:'
      || v_intent.id::text,
    jsonb_build_object(
      'payment_intent_id',
        v_intent.id,
      'amount',
        v_intent.amount,
      'provider_request_key',
        v_intent.provider_request_key
    )
  )
  on conflict do nothing;

  return query
  select
    v_session.id,
    v_session.payment_intent_id,
    v_session.amount,
    v_session.status,
    true;
end;
$$;


/*
 * Backend-only execution.
 */

revoke all on function
public.cing_wallet_upsert_pos_session_from_event2_v1(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_upsert_pos_session_from_event2_v1(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text
)
to service_role;


revoke all on function
public.cing_wallet_freeze_pos_session_amount_v1(
  uuid,
  bigint,
  text,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_freeze_pos_session_amount_v1(
  uuid,
  bigint,
  text,
  text
)
to service_role;


revoke all on function
public.cing_wallet_link_pos_session_payment_intent_v1(
  uuid,
  uuid
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_link_pos_session_payment_intent_v1(
  uuid,
  uuid
)
to service_role;


/*
 * Structural assertions.
 */

do $$
begin
  if to_regclass(
    'public.cing_wallet_pos_sessions'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_SESSION_TABLE_MISSING';
  end if;

  if to_regclass(
    'public.cing_wallet_pos_session_audit'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_SESSION_AUDIT_TABLE_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_upsert_pos_session_from_event2_v1(text,text,text,text,text,jsonb,jsonb,text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_EVENT2_AUTHORITY_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_freeze_pos_session_amount_v1(uuid,bigint,text,text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_AMOUNT_AUTHORITY_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_link_pos_session_payment_intent_v1(uuid,uuid)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_INTENT_LINK_AUTHORITY_MISSING';
  end if;
end;
$$;

commit;
