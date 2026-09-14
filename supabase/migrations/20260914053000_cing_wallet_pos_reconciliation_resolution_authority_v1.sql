begin;


/*
 * ==========================================================
 * CING WALLET POS RECONCILIATION RESOLUTION AUTHORITY V1
 * ==========================================================
 *
 * Financial rules:
 *
 * - original POS payment intent is immutable evidence;
 * - original Wallet payment transaction is immutable evidence;
 * - Event 11 evidence is immutable evidence;
 * - resolution history is append-only;
 * - caller NEVER supplies customer identity or compensation amount;
 * - PostgreSQL derives both from canonical stored evidence;
 * - only amount_mismatch may produce a Wallet compensation;
 * - positive difference => compensating debit;
 * - negative difference => compensating credit;
 * - zero difference => financial compensation forbidden.
 *
 * HTTP/backend may supply only:
 *
 *   alert_id
 *   request_id
 *   resolution_action
 *   reason_code
 *   note
 *   actor_id
 */


/*
 * No direct insert authority.
 *
 * SECURITY DEFINER RPC below is the only write surface.
 */
revoke all
on table
  public.cing_wallet_pos_reconciliation_resolutions
from public, anon, authenticated, service_role;


/*
 * ----------------------------------------------------------
 * Atomic Super Admin resolution authority.
 * ----------------------------------------------------------
 */
create or replace function
public.cing_wallet_resolve_pos_reconciliation_v1(
  p_alert_id uuid,
  p_request_id uuid,
  p_resolution_action text,
  p_reason_code text,
  p_note text,
  p_actor_id text
)
returns table (
  resolution_id uuid,
  alert_id uuid,
  session_id uuid,
  resolution_action text,
  expected_amount bigint,
  actual_amount bigint,
  difference_amount bigint,
  compensating_wallet_transaction_id uuid,
  alert_status text,
  applied boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz :=
    clock_timestamp();

  v_action text;
  v_reason_code text;
  v_note text;
  v_actor_id text;

  v_alert
    public.cing_wallet_pos_reconciliation_alerts%rowtype;

  v_session
    public.cing_wallet_pos_sessions%rowtype;

  v_intent
    public.cing_wallet_pos_payment_intents%rowtype;

  v_existing
    public.cing_wallet_pos_reconciliation_resolutions%rowtype;

  v_resolution
    public.cing_wallet_pos_reconciliation_resolutions%rowtype;

  v_wallet_transaction
    public.cing_wallet_transactions%rowtype;

  v_compensation_amount bigint;
  v_signed_amount bigint;
  v_idempotency_key text;
  v_alert_status text;
begin
  if p_alert_id is null then
    raise exception
      'CING_WALLET_POS_RESOLUTION_ALERT_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception
      'CING_WALLET_POS_RESOLUTION_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  v_action :=
    lower(
      coalesce(
        nullif(
          btrim(
            p_resolution_action
          ),
          ''
        ),
        ''
      )
    );

  if v_action not in (
    'accept_as_is',
    'compensating_debit',
    'compensating_credit',
    'pos_correction_confirmed',
    'manual_review'
  ) then
    raise exception
      'CING_WALLET_POS_RESOLUTION_ACTION_INVALID'
      using errcode = '22023';
  end if;

  v_reason_code :=
    lower(
      coalesce(
        nullif(
          btrim(
            p_reason_code
          ),
          ''
        ),
        ''
      )
    );

  if v_reason_code = ''
     or v_reason_code !~
       '^[a-z0-9][a-z0-9_]{1,63}$'
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_REASON_INVALID'
      using errcode = '22023';
  end if;

  v_note :=
    case
      when p_note is null
        then null
      else
        nullif(
          btrim(
            p_note
          ),
          ''
        )
    end;

  if p_note is not null
     and v_note is null
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_NOTE_INVALID'
      using errcode = '22023';
  end if;

  if v_note is not null
     and length(v_note) > 1000
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_NOTE_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Financial corrections require explicit human context.
   */
  if v_action in (
    'compensating_debit',
    'compensating_credit'
  )
     and v_note is null
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_NOTE_REQUIRED'
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

  if v_actor_id is null
     or length(v_actor_id) > 512
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  v_idempotency_key :=
    'wallet_pos_reconciliation_resolution:'
    || p_request_id::text;

  /*
   * Serialize retries for the same resolution request UUID.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_idempotency_key,
      0
    )
  );

  /*
   * Durable replay authority.
   *
   * Replay is returned before checking current alert state because
   * the original successful action may already have resolved it.
   */
  select r.*
  into v_existing
  from
    public.cing_wallet_pos_reconciliation_resolutions r
  where r.request_id =
    p_request_id;

  if found then
    if v_existing.alert_id <>
         p_alert_id
       or v_existing.resolution_action <>
         v_action
       or v_existing.reason_code <>
         v_reason_code
       or v_existing.note
         is distinct from
         v_note
       or v_existing.actor_id <>
         v_actor_id
    then
      raise exception
        'CING_WALLET_POS_RESOLUTION_REPLAY_CONFLICT'
        using errcode = '23505';
    end if;

    select a.status
    into v_alert_status
    from
      public.cing_wallet_pos_reconciliation_alerts a
    where a.id =
      v_existing.alert_id;

    return query
    select
      v_existing.id,
      v_existing.alert_id,
      v_existing.session_id,
      v_existing.resolution_action,
      v_existing.expected_amount,
      v_existing.actual_amount,
      v_existing.difference_amount,
      v_existing.compensating_wallet_transaction_id,
      coalesce(
        v_alert_status,
        'resolved'
      ),
      false,
      v_existing.created_at;

    return;
  end if;

  /*
   * Lock canonical mismatch evidence.
   */
  select a.*
  into v_alert
  from
    public.cing_wallet_pos_reconciliation_alerts a
  where a.id =
    p_alert_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_RESOLUTION_ALERT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_alert.status <>
    'open'
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_ALERT_NOT_OPEN'
      using errcode = '55000';
  end if;

  /*
   * Lock exact linked session.
   */
  select s.*
  into v_session
  from
    public.cing_wallet_pos_sessions s
  where s.id =
    v_alert.session_id
  for update;

  if not found then
    raise exception
      'CING_WALLET_POS_RESOLUTION_SESSION_NOT_FOUND'
      using errcode = '55000';
  end if;

  if v_session.id <>
    v_alert.session_id
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_SESSION_CONFLICT'
      using errcode = '55000';
  end if;

  /*
   * Alert evidence must match immutable session/Event11 snapshot.
   *
   * Never trust caller-provided financial values.
   */
  if v_alert.expected_amount
       is distinct from
       v_session.amount
     or v_alert.actual_amount
       is distinct from
       v_session.ipos_final_total
     or v_alert.difference_amount
       is distinct from
       (
         coalesce(
           v_session.ipos_final_total,
           0
         )
         -
         coalesce(
           v_session.amount,
           0
         )
       )
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_EVIDENCE_CONFLICT'
      using errcode = '55000';
  end if;

  /*
   * Load canonical linked paid payment intent if present.
   *
   * Customer identity and original Wallet transaction always
   * come from this row, never from HTTP.
   */
  if v_session.payment_intent_id
    is not null
  then
    select i.*
    into v_intent
    from
      public.cing_wallet_pos_payment_intents i
    where i.id =
      v_session.payment_intent_id
    for update;
  end if;

  /*
   * Financial compensation is allowed only for a proven
   * amount_mismatch backed by a fully paid canonical intent.
   */
  if v_action in (
    'compensating_debit',
    'compensating_credit'
  ) then
    if v_alert.alert_type <>
      'amount_mismatch'
    then
      raise exception
        'CING_WALLET_POS_RESOLUTION_FINANCIAL_ALERT_TYPE_INVALID'
        using errcode = '55000';
    end if;

    if v_intent.id is null
       or v_intent.status <>
         'paid'
       or v_intent.customer_user_id
         is null
       or v_intent.wallet_transaction_id
         is null
       or v_intent.paid_at
         is null
    then
      raise exception
        'CING_WALLET_POS_RESOLUTION_PAID_PROOF_REQUIRED'
        using errcode = '55000';
    end if;

    if v_intent.id <>
      v_session.payment_intent_id
    then
      raise exception
        'CING_WALLET_POS_RESOLUTION_INTENT_CONFLICT'
        using errcode = '55000';
    end if;

    if v_intent.amount <>
      v_alert.expected_amount
    then
      raise exception
        'CING_WALLET_POS_RESOLUTION_ORIGINAL_AMOUNT_CONFLICT'
        using errcode = '55000';
    end if;

    if v_alert.difference_amount is null
       or v_alert.difference_amount = 0
    then
      raise exception
        'CING_WALLET_POS_RESOLUTION_DIFFERENCE_INVALID'
        using errcode = '55000';
    end if;

    if v_action =
      'compensating_debit'
       and v_alert.difference_amount <= 0
    then
      raise exception
        'CING_WALLET_POS_RESOLUTION_DIRECTION_CONFLICT'
        using errcode = '55000';
    end if;

    if v_action =
      'compensating_credit'
       and v_alert.difference_amount >= 0
    then
      raise exception
        'CING_WALLET_POS_RESOLUTION_DIRECTION_CONFLICT'
        using errcode = '55000';
    end if;

    v_compensation_amount :=
      abs(
        v_alert.difference_amount
      );

    v_signed_amount :=
      case
        when v_action =
          'compensating_credit'
        then
          v_compensation_amount
        else
          -v_compensation_amount
      end;

    /*
     * Separate immutable Wallet ledger transaction.
     *
     * Never rewrites the original payment transaction.
     */
    select *
    into v_wallet_transaction
    from
      public.cing_wallet_apply_mutation_private(
        p_user_id =>
          v_intent.customer_user_id,
        p_transaction_type =>
          'admin_adjustment',
        p_amount =>
          v_signed_amount,
        p_idempotency_key =>
          v_idempotency_key,
        p_reason =>
          v_reason_code,
        p_reference_type =>
          'pos_reconciliation_alert',
        p_reference_id =>
          v_alert.id::text,
        p_note =>
          v_note,
        p_actor_type =>
          'admin',
        p_actor_id =>
          v_actor_id,
        p_metadata =>
          jsonb_build_object(
            'authority',
              'cing_wallet_resolve_pos_reconciliation_v1',
            'request_id',
              p_request_id::text,
            'resolution_action',
              v_action,
            'alert_id',
              v_alert.id,
            'session_id',
              v_session.id,
            'payment_intent_id',
              v_intent.id,
            'original_wallet_transaction_id',
              v_intent.wallet_transaction_id,
            'expected_amount',
              v_alert.expected_amount,
            'actual_amount',
              v_alert.actual_amount,
            'difference_amount',
              v_alert.difference_amount
          )
      );
  end if;

  /*
   * Append immutable resolution history.
   */
  insert into
    public.cing_wallet_pos_reconciliation_resolutions (
      request_id,
      alert_id,
      session_id,
      resolution_action,
      reason_code,
      note,
      actor_id,
      expected_amount,
      actual_amount,
      difference_amount,
      compensating_wallet_transaction_id
    )
  values (
    p_request_id,
    v_alert.id,
    v_session.id,
    v_action,
    v_reason_code,
    v_note,
    v_actor_id,
    v_alert.expected_amount,
    v_alert.actual_amount,
    v_alert.difference_amount,
    case
      when v_wallet_transaction.id
        is null
      then
        null
      else
        v_wallet_transaction.id
    end
  )
  returning *
  into v_resolution;

  /*
   * manual_review is intentionally non-closing.
   *
   * Every other explicit operator decision resolves the alert.
   */
  if v_action =
    'manual_review'
  then
    v_alert_status :=
      'open';
  else
    update
      public.cing_wallet_pos_reconciliation_alerts
    set
      status =
        'resolved',
      resolved_at =
        v_now,
      resolved_by =
        v_actor_id,
      resolution_note =
        coalesce(
          v_note,
          v_reason_code
        ),
      updated_at =
        v_now
    where id =
      v_alert.id
      and status =
        'open'
    returning status
    into v_alert_status;

    if not found then
      raise exception
        'CING_WALLET_POS_RESOLUTION_ALERT_STATE_CONFLICT'
        using errcode = '55000';
    end if;
  end if;

  /*
   * Append session audit only.
   *
   * Session financial/Event11 evidence is not rewritten.
   */
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
    'RECONCILIATION_RESOLUTION',
    'admin',
    v_actor_id,
    'resolution_request:'
      || p_request_id::text,
    jsonb_build_object(
      'resolution_id',
        v_resolution.id,
      'alert_id',
        v_alert.id,
      'resolution_action',
        v_action,
      'reason_code',
        v_reason_code,
      'expected_amount',
        v_alert.expected_amount,
      'actual_amount',
        v_alert.actual_amount,
      'difference_amount',
        v_alert.difference_amount,
      'compensating_wallet_transaction_id',
        v_resolution.compensating_wallet_transaction_id,
      'alert_status',
        v_alert_status
    )
  )
  on conflict do nothing;

  return query
  select
    v_resolution.id,
    v_resolution.alert_id,
    v_resolution.session_id,
    v_resolution.resolution_action,
    v_resolution.expected_amount,
    v_resolution.actual_amount,
    v_resolution.difference_amount,
    v_resolution.compensating_wallet_transaction_id,
    v_alert_status,
    true,
    v_resolution.created_at;
end;
$$;


/*
 * Service-role backend only.
 */
revoke all on function
public.cing_wallet_resolve_pos_reconciliation_v1(
  uuid,
  uuid,
  text,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_resolve_pos_reconciliation_v1(
  uuid,
  uuid,
  text,
  text,
  text,
  text
)
to service_role;


/*
 * Structural authority assertions.
 */
do $resolution_authority$
begin
  if to_regprocedure(
    'public.cing_wallet_resolve_pos_reconciliation_v1(uuid,uuid,text,text,text,text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_RPC_MISSING';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_resolve_pos_reconciliation_v1(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_AUTHENTICATED_FORBIDDEN';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cing_wallet_resolve_pos_reconciliation_v1(uuid,uuid,text,text,text,text)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_RESOLUTION_SERVICE_ROLE_MISSING';
  end if;
end;
$resolution_authority$;


commit;
