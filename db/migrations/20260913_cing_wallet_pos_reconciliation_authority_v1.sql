begin;

/*
 * ==========================================================
 * CING WALLET — POS RECONCILIATION AUTHORITY V1
 * ==========================================================
 *
 * Financial boundary:
 *
 * - Wallet settlement remains owned exclusively by
 *   cing_wallet_settle_pos_payment_atomic_v1.
 *
 * - This migration NEVER debits, credits or refunds Wallet.
 *
 * - customer settlement is projected into POS session state.
 *
 * - iPOS Event 11 final total is used only for reconciliation.
 *
 * - mismatch creates durable operational alert.
 *
 * - reconciliation may repair stale POS SESSION STATE from the
 *   canonical payment intent, but it may never repair MONEY.
 */

alter table public.cing_wallet_pos_sessions
add column ipos_final_total bigint,
add column ipos_payment_method text,
add column ipos_trace_no text,
add column event11_snapshot jsonb
  not null
  default '{}'::jsonb,
add column event11_received_at timestamptz,
add column reconciliation_status text
  not null
  default 'pending',
add column reconciliation_attempts integer
  not null
  default 0,
add column reconciliation_error text,
add column reconciled_at timestamptz;


alter table public.cing_wallet_pos_sessions
add constraint
  cing_wallet_pos_sessions_ipos_final_total_ck
check (
  ipos_final_total is null
  or ipos_final_total >= 0
);


alter table public.cing_wallet_pos_sessions
add constraint
  cing_wallet_pos_sessions_reconciliation_status_ck
check (
  reconciliation_status in (
    'pending',
    'matched',
    'amount_mismatch',
    'payment_not_settled',
    'manual_review'
  )
);


alter table public.cing_wallet_pos_sessions
add constraint
  cing_wallet_pos_sessions_reconciliation_attempts_ck
check (
  reconciliation_attempts >= 0
);


create index
  cing_wallet_pos_sessions_reconciliation_idx
on public.cing_wallet_pos_sessions (
  reconciliation_status,
  updated_at desc
);


create table
public.cing_wallet_pos_reconciliation_alerts (
  id uuid
    primary key
    default gen_random_uuid(),

  session_id uuid
    not null
    references public.cing_wallet_pos_sessions(id)
    on update restrict
    on delete restrict,

  alert_type text
    not null,

  severity text
    not null
    default 'high',

  status text
    not null
    default 'open',

  expected_amount bigint,

  actual_amount bigint,

  difference_amount bigint,

  details jsonb
    not null
    default '{}'::jsonb,

  first_detected_at timestamptz
    not null
    default now(),

  last_detected_at timestamptz
    not null
    default now(),

  resolved_at timestamptz,

  resolved_by text,

  resolution_note text,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint
    cing_wallet_pos_reconciliation_alert_type_ck
  check (
    alert_type in (
      'amount_mismatch',
      'payment_not_settled'
    )
  ),

  constraint
    cing_wallet_pos_reconciliation_alert_severity_ck
  check (
    severity in (
      'warning',
      'high',
      'critical'
    )
  ),

  constraint
    cing_wallet_pos_reconciliation_alert_status_ck
  check (
    status in (
      'open',
      'resolved'
    )
  )
);


create unique index
  cing_wallet_pos_reconciliation_alert_open_uq
on public.cing_wallet_pos_reconciliation_alerts (
  session_id,
  alert_type
)
where status = 'open';


create index
  cing_wallet_pos_reconciliation_alert_status_idx
on public.cing_wallet_pos_reconciliation_alerts (
  status,
  last_detected_at desc
);


revoke all
on table public.cing_wallet_pos_reconciliation_alerts
from public, anon, authenticated, service_role;

grant select
on table public.cing_wallet_pos_reconciliation_alerts
to service_role;


/*
 * ==========================================================
 * CUSTOMER SETTLEMENT -> POS SESSION PROJECTION
 * ==========================================================
 *
 * This authority does not perform Wallet settlement.
 *
 * It verifies that the canonical linked payment intent is
 * already durably paid, then projects that fact to the session.
 *
 * Legacy POS payment intents that do not belong to the new
 * session flow return projected=false rather than failing.
 */

create or replace function
public.cing_wallet_project_pos_session_paid_v1(
  p_payment_intent_id uuid
)
returns table (
  projected boolean,
  session_id uuid,
  status text,
  amount bigint,
  wallet_transaction_id uuid,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_session
    public.cing_wallet_pos_sessions%rowtype;
begin
  if p_payment_intent_id is null then
    raise exception
      'CING_WALLET_POS_RECON_INTENT_REQUIRED'
      using errcode = '22023';
  end if;

  select i.*
  into v_intent
  from public.cing_wallet_pos_payment_intents i
  where i.id =
    p_payment_intent_id;

  if not found then
    raise exception
      'CING_WALLET_POS_RECON_INTENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select s.*
  into v_session
  from public.cing_wallet_pos_sessions s
  where s.payment_intent_id =
    p_payment_intent_id
  for update;

  if not found then
    return query
    select
      false,
      null::uuid,
      v_intent.status,
      v_intent.amount,
      v_intent.wallet_transaction_id,
      v_intent.paid_at;

    return;
  end if;

  if v_intent.status <> 'paid'
     or v_intent.wallet_transaction_id is null
     or v_intent.paid_at is null
  then
    raise exception
      'CING_WALLET_POS_RECON_INTENT_NOT_PAID'
      using errcode = '55000';
  end if;

  if v_intent.amount <>
    v_session.amount
  then
    raise exception
      'CING_WALLET_POS_RECON_INTENT_AMOUNT_CONFLICT'
      using errcode = '55000';
  end if;

  if v_session.status in (
    'qr_ready',
    'paid'
  )
  then
    update public.cing_wallet_pos_sessions
    set
      status =
        'reconciliation_pending',
      updated_at =
        v_now
    where id =
      v_session.id
    returning *
    into v_session;
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
    v_session.id,
    'WALLET_SETTLED',
    'system',
    null,
    'wallet_tx:'
      || v_intent.wallet_transaction_id::text,
    jsonb_build_object(
      'payment_intent_id',
        v_intent.id,
      'wallet_transaction_id',
        v_intent.wallet_transaction_id,
      'amount',
        v_intent.amount,
      'customer_user_id',
        v_intent.customer_user_id,
      'paid_at',
        v_intent.paid_at
    )
  )
  on conflict do nothing;

  return query
  select
    true,
    v_session.id,
    v_session.status,
    v_intent.amount,
    v_intent.wallet_transaction_id,
    v_intent.paid_at;
end;
$$;


/*
 * ==========================================================
 * IPOS EVENT 11 RECONCILIATION
 * ==========================================================
 *
 * Identity:
 *
 *   pos_parent + pos_id + sale_tran_id
 *
 * If no Cing POS session exists, this is not a Cing Wallet
 * transaction and reconciliation is a no-op.
 *
 * Self-heal:
 *
 * If customer settlement succeeded but session projection was
 * missed, canonical paid payment intent repairs SESSION STATE.
 *
 * Never repairs Wallet money.
 */

create or replace function
public.cing_wallet_reconcile_pos_event11_v1(
  p_pos_parent text,
  p_pos_id text,
  p_sale_tran_id text,
  p_final_total bigint,
  p_payment_method text,
  p_trace_no text,
  p_event_payload jsonb,
  p_event_fingerprint text
)
returns table (
  found_session boolean,
  session_id uuid,
  reconciliation_status text,
  expected_amount bigint,
  actual_amount bigint,
  difference_amount bigint,
  alert_created boolean,
  state_repaired boolean
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
  v_payment_method text;
  v_trace_no text;
  v_fingerprint text;

  v_session
    public.cing_wallet_pos_sessions%rowtype;

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_difference bigint;
  v_status text;
  v_alert_type text;
  v_alert_created boolean :=
    false;
  v_state_repaired boolean :=
    false;
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

  v_payment_method :=
    nullif(
      btrim(
        coalesce(
          p_payment_method,
          ''
        )
      ),
      ''
    );

  v_trace_no :=
    nullif(
      btrim(
        coalesce(
          p_trace_no,
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

  if v_pos_parent is null
     or v_pos_id is null
     or v_sale_tran_id is null
  then
    raise exception
      'CING_WALLET_POS_EVENT11_IDENTITY_INVALID'
      using errcode = '22023';
  end if;

  if p_final_total is null
     or p_final_total < 0
  then
    raise exception
      'CING_WALLET_POS_EVENT11_TOTAL_INVALID'
      using errcode = '22023';
  end if;

  select s.*
  into v_session
  from public.cing_wallet_pos_sessions s
  where s.pos_parent =
      v_pos_parent
    and s.pos_id =
      v_pos_id
    and s.sale_tran_id =
      v_sale_tran_id
  for update;

  if not found then
    return query
    select
      false,
      null::uuid,
      'pending'::text,
      null::bigint,
      p_final_total,
      null::bigint,
      false,
      false;

    return;
  end if;

  if v_session.payment_intent_id is not null then
    select i.*
    into v_intent
    from public.cing_wallet_pos_payment_intents i
    where i.id =
      v_session.payment_intent_id;

    /*
     * Durable state repair only.
     *
     * This handles the crash window:
     *
     * Wallet debit COMMIT
     * -> HTTP process dies
     * -> POS session projection did not execute
     * -> Event 11 arrives later.
     */
    if found
       and v_intent.status = 'paid'
       and v_intent.wallet_transaction_id is not null
       and v_intent.paid_at is not null
       and v_session.status in (
         'qr_ready',
         'paid'
       )
    then
      update public.cing_wallet_pos_sessions
      set
        status =
          'reconciliation_pending',
        updated_at =
          v_now
      where id =
        v_session.id
      returning *
      into v_session;

      v_state_repaired :=
        true;

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
        v_session.id,
        'PAID_STATE_AUTO_REPAIRED',
        'system',
        null,
        'wallet_tx:'
          || v_intent.wallet_transaction_id::text,
        jsonb_build_object(
          'payment_intent_id',
            v_intent.id,
          'wallet_transaction_id',
            v_intent.wallet_transaction_id,
          'paid_at',
            v_intent.paid_at
        )
      )
      on conflict do nothing;
    end if;
  end if;

  v_difference :=
    p_final_total -
    coalesce(
      v_session.amount,
      0
    );

  if v_intent.id is null
     or v_intent.status <> 'paid'
     or v_intent.wallet_transaction_id is null
     or v_intent.paid_at is null
  then
    v_status :=
      'payment_not_settled';

    v_alert_type :=
      'payment_not_settled';

  elsif v_session.amount is distinct from
    p_final_total
  then
    v_status :=
      'amount_mismatch';

    v_alert_type :=
      'amount_mismatch';

  else
    v_status :=
      'matched';

    v_alert_type :=
      null;
  end if;

  update public.cing_wallet_pos_sessions
  set
    ipos_final_total =
      p_final_total,
    ipos_payment_method =
      v_payment_method,
    ipos_trace_no =
      v_trace_no,
    event11_snapshot =
      coalesce(
        p_event_payload,
        '{}'::jsonb
      ),
    event11_received_at =
      v_now,
    reconciliation_status =
      v_status,
    reconciliation_attempts =
      reconciliation_attempts + 1,
    reconciliation_error =
      case
        when v_status = 'matched'
          then null
        when v_status = 'amount_mismatch'
          then
            'CING_WALLET_POS_EVENT11_AMOUNT_MISMATCH'
        else
          'CING_WALLET_POS_EVENT11_PAYMENT_NOT_SETTLED'
      end,
    reconciled_at =
      case
        when v_status = 'matched'
          then v_now
        else null
      end,
    status =
      case
        when v_status = 'matched'
          then 'reconciled'
        else 'reconciliation_mismatch'
      end,
    updated_at =
      v_now
  where id =
    v_session.id
  returning *
  into v_session;

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
    v_session.id,
    case
      when v_status = 'matched'
        then 'EVENT11_RECONCILED'
      else 'EVENT11_RECONCILIATION_MISMATCH'
    end,
    'ipos',
    v_pos_id,
    v_fingerprint,
    jsonb_build_object(
      'expected_amount',
        v_session.amount,
      'actual_amount',
        p_final_total,
      'difference_amount',
        v_difference,
      'payment_method',
        v_payment_method,
      'trace_no',
        v_trace_no,
      'reconciliation_status',
        v_status
    )
  )
  on conflict do nothing;

  if v_status = 'matched' then
    update
      public.cing_wallet_pos_reconciliation_alerts
    set
      status =
        'resolved',
      resolved_at =
        v_now,
      resolved_by =
        'system:event11_match',
      resolution_note =
        'Event 11 matched canonical Cing Wallet payment',
      updated_at =
        v_now
    where session_id =
        v_session.id
      and status =
        'open';

  else
    insert into
    public.cing_wallet_pos_reconciliation_alerts (
      session_id,
      alert_type,
      severity,
      status,
      expected_amount,
      actual_amount,
      difference_amount,
      details,
      first_detected_at,
      last_detected_at
    )
    values (
      v_session.id,
      v_alert_type,
      case
        when v_alert_type =
          'amount_mismatch'
          then 'critical'
        else 'high'
      end,
      'open',
      v_session.amount,
      p_final_total,
      v_difference,
      jsonb_build_object(
        'pos_parent',
          v_pos_parent,
        'pos_id',
          v_pos_id,
        'sale_tran_id',
          v_sale_tran_id,
        'payment_method',
          v_payment_method,
        'trace_no',
          v_trace_no,
        'payment_intent_id',
          v_session.payment_intent_id
      ),
      v_now,
      v_now
    )
    on conflict (
      session_id,
      alert_type
    )
    where status = 'open'
    do update
    set
      expected_amount =
        excluded.expected_amount,
      actual_amount =
        excluded.actual_amount,
      difference_amount =
        excluded.difference_amount,
      details =
        excluded.details,
      last_detected_at =
        v_now,
      updated_at =
        v_now;

    v_alert_created :=
      true;
  end if;

  return query
  select
    true,
    v_session.id,
    v_status,
    v_session.amount,
    p_final_total,
    v_difference,
    v_alert_created,
    v_state_repaired;
end;
$$;


revoke all on function
public.cing_wallet_project_pos_session_paid_v1(
  uuid
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_project_pos_session_paid_v1(
  uuid
)
to service_role;


revoke all on function
public.cing_wallet_reconcile_pos_event11_v1(
  text,
  text,
  text,
  bigint,
  text,
  text,
  jsonb,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_reconcile_pos_event11_v1(
  text,
  text,
  text,
  bigint,
  text,
  text,
  jsonb,
  text
)
to service_role;


/*
 * Structural assertions.
 */

do $$
begin
  if to_regclass(
    'public.cing_wallet_pos_reconciliation_alerts'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_RECON_ALERT_TABLE_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_project_pos_session_paid_v1(uuid)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_PAID_PROJECTION_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_reconcile_pos_event11_v1(text,text,text,bigint,text,text,jsonb,text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_EVENT11_RECON_AUTHORITY_MISSING';
  end if;
end;
$$;

commit;
