begin;

/*
 * CING WALLET POS — MANUAL SESSION AUTHORITY V2
 *
 * Phase 1 payment flow:
 *
 * cashier reads final total_amount from iPOS
 * -> creates manual Cing Pay session
 * -> amount is frozen immediately
 * -> dynamic QR / Wallet settlement
 * -> Event 11 later binds final sale_tran_id and reconciles.
 *
 * Event 2 remains a separate voucher/campaign integration path.
 *
 * Financial principles:
 * - no Wallet mutation in this migration
 * - manual amount is immutable after creation
 * - one active pre-reconciliation Cing Pay session per POS
 * - mismatch resolution is append-only
 */

/*
 * Existing V1 rows were Event 2 discovered sessions.
 */
alter table
  public.cing_wallet_pos_sessions
add column if not exists
  session_origin text
  not null
  default 'event2';

alter table
  public.cing_wallet_pos_sessions
add column if not exists
  manual_request_id uuid;

alter table
  public.cing_wallet_pos_sessions
drop constraint if exists
  cing_wallet_pos_sessions_session_origin_ck;

alter table
  public.cing_wallet_pos_sessions
add constraint
  cing_wallet_pos_sessions_session_origin_ck
check (
  session_origin in (
    'event2',
    'cashier_manual',
    'ipos_api'
  )
);

/*
 * sale_tran_id is unknown before the cashier completes
 * the bill on iPOS.
 *
 * Event 2 sessions still require it.
 * Manual/API payment sessions may acquire it later
 * during Event 11 reconciliation.
 */
alter table
  public.cing_wallet_pos_sessions
alter column
  sale_tran_id
drop not null;

alter table
  public.cing_wallet_pos_sessions
drop constraint if exists
  cing_wallet_pos_sessions_sale_tran_id_ck;

alter table
  public.cing_wallet_pos_sessions
add constraint
  cing_wallet_pos_sessions_sale_tran_id_ck
check (
  sale_tran_id is null
  or btrim(sale_tran_id) <> ''
);

alter table
  public.cing_wallet_pos_sessions
drop constraint if exists
  cing_wallet_pos_sessions_origin_identity_ck;

alter table
  public.cing_wallet_pos_sessions
add constraint
  cing_wallet_pos_sessions_origin_identity_ck
check (
  (
    session_origin = 'event2'
    and sale_tran_id is not null
    and manual_request_id is null
  )
  or
  (
    session_origin in (
      'cashier_manual',
      'ipos_api'
    )
    and manual_request_id is not null
  )
);

/*
 * Idempotent client/backend request identity.
 */
create unique index if not exists
  cing_wallet_pos_sessions_manual_request_uq
on public.cing_wallet_pos_sessions (
  manual_request_id
)
where manual_request_id is not null;

/*
 * Only one Cing Pay payment session which has not yet
 * reached Event 11 reconciliation may occupy one POS.
 *
 * reconciliation_mismatch and reconciled already have
 * a bound/final Event 11 result, so they no longer
 * occupy this pre-reconciliation slot.
 *
 * Event 2 voucher sessions are deliberately excluded.
 */
create unique index if not exists
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
    'qr_ready',
    'paid',
    'reconciliation_pending'
  );

/*
 * Create the payment session and freeze the cashier
 * entered amount in one PostgreSQL transaction.
 *
 * This RPC DOES NOT:
 * - create QR
 * - create payment intent
 * - debit Wallet
 * - call iPOS
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
returns table (
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
   * Per-POS transaction fence.
   *
   * It serializes concurrent create attempts before
   * we inspect the active-session slot.
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
   * Idempotent replay by request_id.
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
   * Explicit business error in addition to the
   * partial unique index.
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
    'admin',
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
 * Append-only mismatch resolution authority.
 *
 * This is distinct from:
 * - original Wallet transaction
 * - original Event 11 payload
 * - reconciliation alert
 *
 * Financial compensation, when required, will reference
 * one of these immutable resolution records.
 */
create table if not exists
public.cing_wallet_pos_reconciliation_resolutions (
  id uuid
    primary key
    default gen_random_uuid(),

  request_id uuid
    not null,

  alert_id uuid
    not null
    references
      public.cing_wallet_pos_reconciliation_alerts(id)
    on update restrict
    on delete restrict,

  session_id uuid
    not null
    references
      public.cing_wallet_pos_sessions(id)
    on update restrict
    on delete restrict,

  resolution_action text
    not null,

  reason_code text
    not null,

  note text,

  actor_id text
    not null,

  expected_amount bigint,

  actual_amount bigint,

  difference_amount bigint,

  compensating_wallet_transaction_id uuid,

  created_at timestamptz
    not null
    default now(),

  constraint
    cing_wallet_pos_recon_resolution_action_ck
  check (
    resolution_action in (
      'accept_as_is',
      'compensating_debit',
      'compensating_credit',
      'pos_correction_confirmed',
      'manual_review'
    )
  ),

  constraint
    cing_wallet_pos_recon_resolution_reason_ck
  check (
    btrim(reason_code) <> ''
  ),

  constraint
    cing_wallet_pos_recon_resolution_actor_ck
  check (
    btrim(actor_id) <> ''
  )
);

create unique index if not exists
  cing_wallet_pos_recon_resolution_request_uq
on public.cing_wallet_pos_reconciliation_resolutions (
  request_id
);

create index if not exists
  cing_wallet_pos_recon_resolution_session_idx
on public.cing_wallet_pos_reconciliation_resolutions (
  session_id,
  created_at desc
);

create index if not exists
  cing_wallet_pos_recon_resolution_alert_idx
on public.cing_wallet_pos_reconciliation_resolutions (
  alert_id,
  created_at desc
);

/*
 * Hard append-only fence.
 */
create or replace function
public.cing_wallet_pos_resolution_immutable_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception
    'CING_WALLET_POS_RESOLUTION_IMMUTABLE'
    using errcode = '55000';
end;
$$;

drop trigger if exists
  cing_wallet_pos_resolution_immutable_v2
on public.cing_wallet_pos_reconciliation_resolutions;

create trigger
  cing_wallet_pos_resolution_immutable_v2
before update or delete
on public.cing_wallet_pos_reconciliation_resolutions
for each row
execute function
  public.cing_wallet_pos_resolution_immutable_v2();

revoke all
on table
  public.cing_wallet_pos_reconciliation_resolutions
from public, anon, authenticated;


/*
 * Structural assertions.
 */
do $$
begin
  if to_regprocedure(
    'public.cing_wallet_create_manual_pos_session_v2(text,text,bigint,text,uuid,text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_MANUAL_SESSION_RPC_MISSING';
  end if;

  if to_regclass(
    'public.cing_wallet_pos_reconciliation_resolutions'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_RECON_RESOLUTION_TABLE_MISSING';
  end if;
end;
$$;

commit;
