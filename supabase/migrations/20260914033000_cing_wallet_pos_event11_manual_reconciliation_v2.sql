begin;

/*
 * ==========================================================
 * CING WALLET POS EVENT 11 MANUAL RECONCILIATION V2
 * ==========================================================
 *
 * Phase 1 manual Counter flow has no iPOS sale_tran_id before
 * Wallet payment.
 *
 * Event 11 therefore arrives AFTER Wallet settlement and must:
 *
 * 1. accept only a genuine CING_WALLET tender;
 * 2. preserve exact sale_tran_id replay matching;
 * 3. otherwise bind one eligible paid manual/API session on
 *    the same POS where sale_tran_id is still NULL;
 * 4. compare the immutable Wallet amount with iPOS final total;
 * 5. reconcile or create a durable mismatch alert;
 * 6. NEVER mutate Wallet money.
 */

create or replace function
public.cing_wallet_reconcile_pos_event11_v2(
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
  state_repaired boolean,
  identity_bound boolean
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

  v_candidate_count bigint :=
    0;

  v_difference bigint;
  v_status text;
  v_alert_type text;

  v_alert_created boolean :=
    false;

  v_state_repaired boolean :=
    false;

  v_identity_bound boolean :=
    false;

begin
  v_pos_parent :=
    nullif(
      btrim(
        p_pos_parent
      ),
      ''
    );

  v_pos_id :=
    nullif(
      btrim(
        p_pos_id
      ),
      ''
    );

  v_sale_tran_id :=
    nullif(
      btrim(
        p_sale_tran_id
      ),
      ''
    );

  v_payment_method :=
    upper(
      replace(
        coalesce(
          nullif(
            btrim(
              p_payment_method
            ),
            ''
          ),
          ''
        ),
        ' ',
        '_'
      )
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

  /*
   * Non-Cing tenders are not Cing Wallet reconciliation events.
   *
   * No amount-only fallback.
   * No first-payment fallback.
   */
  if v_payment_method <>
    'CING_WALLET'
  then
    return query
    select
      false,
      null::uuid,
      'ignored_non_cing_wallet'::text,
      null::bigint,
      p_final_total,
      null::bigint,
      false,
      false,
      false;

    return;
  end if;

  /*
   * ----------------------------------------------------------
   * A. Exact replay / already-bound identity
   * ----------------------------------------------------------
   */
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

  /*
   * ----------------------------------------------------------
   * B. First Event 11 for a manual pre-bill payment
   * ----------------------------------------------------------
   *
   * Candidate requirements:
   *
   * - same POS;
   * - cashier_manual / future ipos_api origin;
   * - sale_tran_id has never been bound;
   * - linked payment intent exists;
   * - Wallet settlement is already canonical PAID;
   * - session is in a paid-capable pre-reconciliation state.
   *
   * A2 already enforces at most one active manual payment per POS.
   * Count check remains as an explicit fail-closed defense.
   */
  if not found then
    select
      count(*)
    into
      v_candidate_count
    from public.cing_wallet_pos_sessions s
    join public.cing_wallet_pos_payment_intents i
      on i.id =
        s.payment_intent_id
    where s.pos_parent =
        v_pos_parent
      and s.pos_id =
        v_pos_id
      and s.session_origin in (
        'cashier_manual',
        'ipos_api'
      )
      and s.sale_tran_id is null
      and s.status in (
        'qr_ready',
        'paid',
        'reconciliation_pending'
      )
      and i.status =
        'paid'
      and i.wallet_transaction_id
        is not null
      and i.paid_at
        is not null;

    if v_candidate_count > 1 then
      raise exception
        'CING_WALLET_POS_EVENT11_MANUAL_SESSION_AMBIGUOUS'
        using errcode = '55000';
    end if;

    if v_candidate_count = 0 then
      return query
      select
        false,
        null::uuid,
        'pending'::text,
        null::bigint,
        p_final_total,
        null::bigint,
        false,
        false,
        false;

      return;
    end if;

    select s.*
    into v_session
    from public.cing_wallet_pos_sessions s
    join public.cing_wallet_pos_payment_intents i
      on i.id =
        s.payment_intent_id
    where s.pos_parent =
        v_pos_parent
      and s.pos_id =
        v_pos_id
      and s.session_origin in (
        'cashier_manual',
        'ipos_api'
      )
      and s.sale_tran_id is null
      and s.status in (
        'qr_ready',
        'paid',
        'reconciliation_pending'
      )
      and i.status =
        'paid'
      and i.wallet_transaction_id
        is not null
      and i.paid_at
        is not null
    order by
      s.created_at asc
    limit 1
    for update of s;

    if not found then
      raise exception
        'CING_WALLET_POS_EVENT11_MANUAL_SESSION_DISAPPEARED'
        using errcode = '55000';
    end if;

    /*
     * Immutable first binding.
     *
     * Existing DB uniqueness on POS + sale_tran_id arbitrates
     * duplicate iPOS identities.
     */
    update public.cing_wallet_pos_sessions
    set
      sale_tran_id =
        v_sale_tran_id,
      updated_at =
        v_now
    where id =
        v_session.id
      and sale_tran_id
        is null
    returning *
    into v_session;

    if not found then
      raise exception
        'CING_WALLET_POS_EVENT11_IDENTITY_BIND_CONFLICT'
        using errcode = '55000';
    end if;

    v_identity_bound :=
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
      'EVENT11_IDENTITY_BOUND',
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
        'payment_method',
          'CING_WALLET'
      )
    )
    on conflict do nothing;

  end if;

  /*
   * Load canonical linked payment intent.
   */
  if v_session.payment_intent_id
    is not null
  then
    select i.*
    into v_intent
    from public.cing_wallet_pos_payment_intents i
    where i.id =
      v_session.payment_intent_id;
  end if;

  /*
   * Durable state repair only.
   *
   * Wallet money has already committed independently.
   */
  if v_intent.id is not null
     and v_intent.status =
       'paid'
     and v_intent.wallet_transaction_id
       is not null
     and v_intent.paid_at
       is not null
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

  v_difference :=
    p_final_total -
    coalesce(
      v_session.amount,
      0
    );

  /*
   * Payment method mismatch is impossible here because non-Cing
   * tender returned before session selection.
   */
  if v_intent.id is null
     or v_intent.status <>
       'paid'
     or v_intent.wallet_transaction_id
       is null
     or v_intent.paid_at
       is null
  then
    v_status :=
      'payment_not_settled';

    v_alert_type :=
      'payment_not_settled';

  elsif v_session.amount
    is distinct from
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
      'CING_WALLET',
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
        when v_status =
          'matched'
        then
          null

        when v_status =
          'amount_mismatch'
        then
          'CING_WALLET_POS_EVENT11_AMOUNT_MISMATCH'

        else
          'CING_WALLET_POS_EVENT11_PAYMENT_NOT_SETTLED'
      end,
    reconciled_at =
      case
        when v_status =
          'matched'
        then
          v_now

        else
          null
      end,
    status =
      case
        when v_status =
          'matched'
        then
          'reconciled'

        else
          'reconciliation_mismatch'
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
      when v_status =
        'matched'
      then
        'EVENT11_RECONCILED'

      else
        'EVENT11_RECONCILIATION_MISMATCH'
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
        'CING_WALLET',
      'trace_no',
        v_trace_no,
      'reconciliation_status',
        v_status,
      'identity_bound',
        v_identity_bound
    )
  )
  on conflict do nothing;

  if v_status =
    'matched'
  then
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
        then
          'critical'

        else
          'high'
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
          'CING_WALLET',
        'trace_no',
          v_trace_no,
        'payment_intent_id',
          v_session.payment_intent_id,
        'identity_bound',
          v_identity_bound
      ),
      v_now,
      v_now
    )
    on conflict (
      session_id,
      alert_type
    )
    where status =
      'open'
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
    v_state_repaired,
    v_identity_bound;
end;
$$;


revoke all on function
public.cing_wallet_reconcile_pos_event11_v2(
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
public.cing_wallet_reconcile_pos_event11_v2(
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
do $migration$
begin
  if to_regprocedure(
    'public.cing_wallet_reconcile_pos_event11_v2(text,text,text,bigint,text,text,jsonb,text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_EVENT11_RECON_V2_MISSING';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_reconcile_pos_event11_v2(text,text,text,bigint,text,text,jsonb,text)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_EVENT11_RECON_V2_AUTHENTICATED_FORBIDDEN';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cing_wallet_reconcile_pos_event11_v2(text,text,text,bigint,text,text,jsonb,text)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_EVENT11_RECON_V2_SERVICE_ROLE_MISSING';
  end if;
end;
$migration$;

commit;
