begin;

/*
 * CING GAME CENTER V2 — BLOCK PUZZLE V5
 * REVIVE CREDIT CONTINUE AUTHORITY V1
 *
 * Prerequisites:
 * - Revive Credit foundation + atomic mutation
 * - Block Puzzle V5 session constraints
 * - Block Puzzle V5 submit capability
 *
 * Exact session contract: 4 / 4 / 3 / 5
 * Continue credit costs: 1, 2, 4, 8, 16
 *
 * This migration DEFINES an authority.
 * It does not spend credits during migration.
 *
 * Historical loyalty-point Continue RPC and its
 * purchases table remain unchanged.
 */

/* ----------------------------------------------------------
 * 1. FAIL-CLOSED CAPABILITY PRECONDITIONS
 * ---------------------------------------------------------- */

do $migration$
declare
  v_versions text;
  v_continue text;
  v_submit text;
begin

  select pg_get_constraintdef(c.oid)
    into v_versions
  from pg_constraint c
  where c.conrelid =
    'public.cing_block_puzzle_sessions'::regclass
    and c.conname =
      'cing_block_puzzle_sessions_versions_ck'
    and c.contype = 'c'
    and c.convalidated = true;

  select pg_get_constraintdef(c.oid)
    into v_continue
  from pg_constraint c
  where c.conrelid =
    'public.cing_block_puzzle_sessions'::regclass
    and c.conname =
      'cing_block_puzzle_sessions_continue_count_ck'
    and c.contype = 'c'
    and c.convalidated = true;

  if v_versions is null
     or position('engine_version = 4' in v_versions) = 0
     or position('rules_version = 4' in v_versions) = 0
     or position('score_version = 3' in v_versions) = 0
     or position('replay_version = 5' in v_versions) = 0
     or v_continue is null
     or position('continue_count <= 5' in v_continue) = 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_SESSION_CAPABILITY_NOT_READY';
  end if;

  if to_regprocedure(
    'public.cing_revive_credit_apply_private_v1('
    || 'text,integer,text,text,text,text,uuid,jsonb)'
  ) is null then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_CREDIT_AUTHORITY_NOT_READY';
  end if;

  v_submit := pg_get_functiondef(
    to_regprocedure(
      'public.cing_block_puzzle_submit_session_atomic_v2('
      || 'uuid,text,integer,text,integer,integer,integer,integer)'
    )
  );

  if v_submit is null
     or position('p_continues_used > 5'
                 in lower(v_submit)) = 0
     or position('cing_block_puzzle_submit_effects'
                 in v_submit) = 0
  then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_SUBMIT_CAPABILITY_NOT_READY';
  end if;

end;
$migration$;

/* ----------------------------------------------------------
 * 2. V5-ONLY DURABLE CONTINUE RECEIPT
 *
 * Separate from historical loyalty-point purchases.
 * ---------------------------------------------------------- */

create table
  public.cing_block_puzzle_v5_revive_purchases (

    id uuid primary key,

    request_id uuid not null,

    session_id uuid not null
      references
        public.cing_block_puzzle_sessions(id)
      on update restrict
      on delete restrict,

    user_id text not null,

    continue_index integer not null,

    credit_cost integer not null,

    credit_transaction_id bigint not null
      references
        public.cing_revive_credit_transactions(id)
      on update restrict
      on delete restrict,

    verified_replay_fingerprint text not null,

    created_at timestamptz
      not null
      default now(),

    constraint
      cing_bp_v5_revive_user_ck
    check (
      btrim(user_id) <> ''
    ),

    constraint
      cing_bp_v5_revive_index_ck
    check (
      continue_index between 1 and 5
    ),

    constraint
      cing_bp_v5_revive_cost_ck
    check (
      (
        continue_index = 1
        and credit_cost = 1
      )
      or (
        continue_index = 2
        and credit_cost = 2
      )
      or (
        continue_index = 3
        and credit_cost = 4
      )
      or (
        continue_index = 4
        and credit_cost = 8
      )
      or (
        continue_index = 5
        and credit_cost = 16
      )
    ),

    constraint
      cing_bp_v5_revive_fingerprint_ck
    check (
      verified_replay_fingerprint
        ~ '^[0-9a-f]{64}$'
    ),

    constraint
      cing_bp_v5_revive_user_request_uq
    unique (
      user_id,
      request_id
    ),

    constraint
      cing_bp_v5_revive_session_index_uq
    unique (
      session_id,
      continue_index
    ),

    constraint
      cing_bp_v5_revive_credit_tx_uq
    unique (
      credit_transaction_id
    )
  );

/*
 * Only the SECURITY DEFINER business authority may write.
 */

revoke all
on table
  public.cing_block_puzzle_v5_revive_purchases
from public, anon, authenticated, service_role;

grant select
on table
  public.cing_block_puzzle_v5_revive_purchases
to service_role;

/* ----------------------------------------------------------
 * 3. V5-ONLY ATOMIC REVIVE
 *
 * p_verified_replay_fingerprint MUST be supplied by
 * trusted backend code AFTER verifyReplayAuthority().
 *
 * Client transcript/fingerprint is not an SQL authority.
 * ---------------------------------------------------------- */

create function
public.cing_block_puzzle_v5_revive_apply_v1(

  p_purchase_id uuid,
  p_request_id uuid,
  p_session_id uuid,
  p_user_id text,
  p_expected_continue_index integer,
  p_verified_replay_fingerprint text

)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare

  v_session
    public.cing_block_puzzle_sessions%rowtype;

  v_existing
    public.cing_block_puzzle_v5_revive_purchases%rowtype;

  v_purchase
    public.cing_block_puzzle_v5_revive_purchases%rowtype;

  v_credit
    public.cing_revive_credit_transactions%rowtype;

  v_now timestamptz :=
    clock_timestamp();

  v_next_index integer;
  v_cost integer;

  v_applied boolean;
  v_credit_tx_id bigint;
  v_balance_after integer;

  v_metadata jsonb;

begin

  /* --------------------------
   * Input contract.
   * -------------------------- */

  if p_purchase_id is null
     or p_request_id is null
     or p_session_id is null
     or p_user_id is null
     or btrim(p_user_id) = ''
     or p_expected_continue_index is null
     or p_expected_continue_index not between 1 and 5
     or p_verified_replay_fingerprint is null
     or p_verified_replay_fingerprint
          !~ '^[0-9a-f]{64}$'
  then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_INVALID_INPUT'
      using errcode = '22023';
  end if;

  /* --------------------------
   * Session serialization.
   * -------------------------- */

  select *
    into v_session
  from public.cing_block_puzzle_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception
      'BLOCK_PUZZLE_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_session.user_id <> p_user_id then
    raise exception
      'BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH'
      using errcode = '42501';
  end if;

  if v_session.game_key <> 'cing-block-puzzle'
     or v_session.engine_version <> 4
     or v_session.rules_version <> 4
     or v_session.score_version <> 3
     or v_session.replay_version <> 5
  then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_SESSION_CONTRACT_INVALID'
      using errcode = 'P0001';
  end if;

  /*
   * Durable idempotent replay BEFORE checking current
   * lifecycle, balance or next Continue index.
   */

  select *
    into v_existing
  from public.cing_block_puzzle_v5_revive_purchases p
  where p.user_id = p_user_id
    and p.request_id = p_request_id;

  if found then

    if v_existing.session_id <> p_session_id
       or v_existing.continue_index
            <> p_expected_continue_index
       or v_existing.verified_replay_fingerprint
            <> p_verified_replay_fingerprint
    then
      raise exception
        'BLOCK_PUZZLE_V5_REVIVE_REQUEST_CONFLICT'
        using errcode = '23505';
    end if;

    select *
      into v_credit
    from public.cing_revive_credit_transactions t
    where t.id =
      v_existing.credit_transaction_id
      and t.user_id = p_user_id
      and t.session_id = p_session_id
      and t.transaction_type = 'deduct'
      and t.reference_type =
        'block_puzzle_v5_continue'
      and t.reference_id =
        p_request_id::text
      and t.game_key =
        'cing-block-puzzle'
      and t.amount =
        -v_existing.credit_cost;

    if not found then
      raise exception
        'BLOCK_PUZZLE_V5_REVIVE_HISTORY_INCONSISTENT'
        using errcode = '55000';
    end if;

    return jsonb_build_object(
      'purchase_id', v_existing.id,
      'session_id', v_existing.session_id,
      'continue_index', v_existing.continue_index,
      'credit_cost', v_existing.credit_cost,
      'credit_transaction_id', v_credit.id,
      'balance_before', v_credit.balance_before,
      'balance_after', v_credit.balance_after,
      'continue_count', v_existing.continue_index,
      'verified_replay_fingerprint',
        v_existing.verified_replay_fingerprint,
      'created_at', v_existing.created_at,
      'idempotent', true
    );

  end if;

  /* --------------------------
   * New purchase eligibility.
   * -------------------------- */

  if v_session.status = 'expired'
     or v_now >= v_session.expires_at
  then
    raise exception
      'BLOCK_PUZZLE_SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_session.status <> 'active' then
    raise exception
      'BLOCK_PUZZLE_SESSION_STATUS_INVALID'
      using errcode = 'P0001';
  end if;

  if v_session.continue_count >= 5 then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;

  v_next_index :=
    v_session.continue_count + 1;

  if p_expected_continue_index <> v_next_index then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_INDEX_CONFLICT'
      using errcode = '23505';
  end if;

  /*
   * Server-owned price. No client cost argument.
   */

  v_cost :=
    case v_next_index
      when 1 then 1
      when 2 then 2
      when 3 then 4
      when 4 then 8
      when 5 then 16
      else null
    end;

  if v_cost is null then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_COST_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Stable metadata is essential for retry equality.
   * No generated timestamps/purchase UUID in metadata.
   */

  v_metadata :=
    jsonb_build_object(
      'continue_index', v_next_index,
      'verified_replay_fingerprint',
        p_verified_replay_fingerprint
    );

  /*
   * Credit debit, receipt and session count share
   * the same PostgreSQL transaction.
   */

  select
    c.applied,
    c.transaction_id,
    c.balance_after
  into
    v_applied,
    v_credit_tx_id,
    v_balance_after
  from public.cing_revive_credit_apply_private_v1(
    p_user_id,
    -v_cost,
    'Block Puzzle V5 Continue',
    'block_puzzle_v5_continue',
    p_request_id::text,
    'cing-block-puzzle',
    p_session_id,
    v_metadata
  ) c;

  if v_applied is distinct from true
     or v_credit_tx_id is null
     or v_balance_after is null
  then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_CREDIT_APPLY_INCONSISTENT'
      using errcode = '55000';
  end if;

  select *
    into v_credit
  from public.cing_revive_credit_transactions t
  where t.id = v_credit_tx_id
    and t.user_id = p_user_id
    and t.session_id = p_session_id
    and t.reference_type =
      'block_puzzle_v5_continue'
    and t.reference_id =
      p_request_id::text
    and t.transaction_type = 'deduct'
    and t.amount = -v_cost;

  if not found
     or v_credit.balance_after <> v_balance_after
  then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_LEDGER_INCONSISTENT'
      using errcode = '55000';
  end if;

  insert into
    public.cing_block_puzzle_v5_revive_purchases (

      id,
      request_id,
      session_id,
      user_id,
      continue_index,
      credit_cost,
      credit_transaction_id,
      verified_replay_fingerprint

    )
  values (

    p_purchase_id,
    p_request_id,
    p_session_id,
    p_user_id,
    v_next_index,
    v_cost,
    v_credit_tx_id,
    p_verified_replay_fingerprint

  )
  returning *
    into v_purchase;

  update
    public.cing_block_puzzle_sessions s
  set continue_count = v_next_index
  where s.id = p_session_id
    and s.continue_count = v_next_index - 1
  returning *
    into v_session;

  if not found
     or v_session.continue_count <> v_next_index
  then
    raise exception
      'BLOCK_PUZZLE_V5_REVIVE_SESSION_INVARIANT'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'purchase_id', v_purchase.id,
    'session_id', v_purchase.session_id,
    'continue_index', v_purchase.continue_index,
    'credit_cost', v_purchase.credit_cost,
    'credit_transaction_id', v_credit.id,
    'balance_before', v_credit.balance_before,
    'balance_after', v_credit.balance_after,
    'continue_count', v_session.continue_count,
    'verified_replay_fingerprint',
      v_purchase.verified_replay_fingerprint,
    'created_at', v_purchase.created_at,
    'idempotent', false
  );

end;
$function$;

/* ----------------------------------------------------------
 * 4. BACKEND-ONLY RPC EXECUTION
 * ---------------------------------------------------------- */

revoke all
on function
public.cing_block_puzzle_v5_revive_apply_v1(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_block_puzzle_v5_revive_apply_v1(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  text
)
to service_role;

commit;
