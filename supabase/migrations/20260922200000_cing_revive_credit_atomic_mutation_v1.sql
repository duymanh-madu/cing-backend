begin;

/*
 * CING GAME CENTER V2
 * ATOMIC REVIVE CREDIT MUTATION V1
 *
 * Depends on:
 * 20260922_cing_revive_credit_foundation_v1.sql
 *
 * PRIVATE BUILDING BLOCK ONLY.
 *
 * No direct service_role or customer EXECUTE grant.
 * Future business-domain SECURITY DEFINER functions
 * must validate their own eligibility and references.
 */

create function public.cing_revive_credit_apply_private_v1(
  p_user_id text,
  p_amount integer,
  p_reason text,
  p_reference_type text,
  p_reference_id text,
  p_game_key text,
  p_session_id uuid,
  p_metadata jsonb
)
returns table (
  applied boolean,
  transaction_id bigint,
  balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_reason text;
  v_reference_type text;
  v_reference_id text;
  v_game_key text;

  v_type text;

  v_existing
    public.cing_revive_credit_transactions%rowtype;

  v_balance_before integer;
  v_balance_after_big bigint;
  v_balance_after integer;

  v_transaction_id bigint;
begin
  v_user_id :=
    nullif(btrim(coalesce(p_user_id, '')), '');

  v_reason :=
    nullif(btrim(coalesce(p_reason, '')), '');

  v_reference_type :=
    nullif(btrim(coalesce(p_reference_type, '')), '');

  v_reference_id :=
    nullif(btrim(coalesce(p_reference_id, '')), '');

  v_game_key :=
    nullif(btrim(coalesce(p_game_key, '')), '');

  if v_user_id is null then
    raise exception 'REVIVE_USER_REQUIRED'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'REVIVE_AMOUNT_INVALID'
      using errcode = '22023';
  end if;

  if v_reason is null then
    raise exception 'REVIVE_REASON_REQUIRED'
      using errcode = '22023';
  end if;

  if v_reference_type is null
     or v_reference_id is null
  then
    raise exception 'REVIVE_REFERENCE_REQUIRED'
      using errcode = '22023';
  end if;

  if p_game_key is not null
     and v_game_key is null
  then
    raise exception 'REVIVE_GAME_KEY_INVALID'
      using errcode = '22023';
  end if;

  if p_metadata is null
     or jsonb_typeof(p_metadata) <> 'object'
  then
    raise exception 'REVIVE_METADATA_INVALID'
      using errcode = '22023';
  end if;

  if p_amount > 0 then
    v_type := 'add';
  else
    v_type := 'deduct';
  end if;

  /*
   * Optimistic durable replay lookup.
   * Historical balance_after is returned, never
   * the player's unrelated later balance.
   */

  select *
    into v_existing
  from public.cing_revive_credit_transactions t
  where t.user_id = v_user_id
    and t.reference_type = v_reference_type
    and t.reference_id = v_reference_id;

  if found then
    if v_existing.amount <> p_amount
       or v_existing.transaction_type <> v_type
       or v_existing.reason <> v_reason
       or v_existing.game_key
            is distinct from v_game_key
       or v_existing.session_id
            is distinct from p_session_id
       or v_existing.metadata <> p_metadata
    then
      raise exception 'REVIVE_REFERENCE_CONFLICT'
        using errcode = '23505';
    end if;

    return query
    select
      false,
      v_existing.id,
      v_existing.balance_after;

    return;
  end if;

  /*
   * A missing customer must never receive
   * an orphaned revival balance.
   *
   * This does not establish caller authorization:
   * business-domain authorities own that check.
   */

  perform 1
  from public.players p
  where p.user_id = v_user_id;

  if not found then
    raise exception 'REVIVE_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Ensure a balance row exists.
   *
   * Concurrent first grants serialize via the
   * primary key / ON CONFLICT fence.
   */

  insert into public.cing_revive_credit_balances (
    user_id,
    balance
  )
  values (
    v_user_id,
    0
  )
  on conflict (user_id) do nothing;

  /*
   * All mutations for one player serialize
   * through this row lock.
   */

  select b.balance
    into v_balance_before
  from public.cing_revive_credit_balances b
  where b.user_id = v_user_id
  for update;

  if not found then
    raise exception 'REVIVE_BALANCE_ROW_MISSING'
      using errcode = '55000';
  end if;

  /*
   * A concurrent same-reference request may
   * have waited on this balance lock.
   *
   * Recheck AFTER acquiring the lock.
   */

  select *
    into v_existing
  from public.cing_revive_credit_transactions t
  where t.user_id = v_user_id
    and t.reference_type = v_reference_type
    and t.reference_id = v_reference_id;

  if found then
    if v_existing.amount <> p_amount
       or v_existing.transaction_type <> v_type
       or v_existing.reason <> v_reason
       or v_existing.game_key
            is distinct from v_game_key
       or v_existing.session_id
            is distinct from p_session_id
       or v_existing.metadata <> p_metadata
    then
      raise exception 'REVIVE_REFERENCE_CONFLICT'
        using errcode = '23505';
    end if;

    return query
    select
      false,
      v_existing.id,
      v_existing.balance_after;

    return;
  end if;

  /*
   * Compute using bigint before narrowing
   * to the schema's integer balance.
   */

  v_balance_after_big :=
    v_balance_before::bigint
    + p_amount::bigint;

  if v_balance_after_big < 0 then
    raise exception 'INSUFFICIENT_REVIVE_CREDITS'
      using errcode = 'P0001';
  end if;

  if v_balance_after_big > 2147483647::bigint then
    raise exception 'REVIVE_BALANCE_OVERFLOW'
      using errcode = '22003';
  end if;

  v_balance_after :=
    v_balance_after_big::integer;

  /*
   * Balance update and ledger insertion are
   * one PostgreSQL transaction.
   *
   * If the insert fails, the update rolls back.
   */

  update public.cing_revive_credit_balances b
  set balance = v_balance_after,
      updated_at = now()
  where b.user_id = v_user_id;

  insert into public.cing_revive_credit_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    reason,
    game_key,
    session_id,
    reference_type,
    reference_id,
    metadata
  )
  values (
    v_user_id,
    v_type,
    p_amount,
    v_balance_before,
    v_balance_after,
    v_reason,
    v_game_key,
    p_session_id,
    v_reference_type,
    v_reference_id,
    p_metadata
  )
  returning id
  into v_transaction_id;

  return query
  select
    true,
    v_transaction_id,
    v_balance_after;
end;
$$;

/*
 * PostgreSQL functions normally have PUBLIC
 * EXECUTE by default. Remove that default.
 *
 * SQL business authorities created later
 * must have the appropriate function-owner
 * execution privileges.
 */

revoke all
on function public.cing_revive_credit_apply_private_v1(
  text,
  integer,
  text,
  text,
  text,
  text,
  uuid,
  jsonb
)
from public, anon, authenticated, service_role;

commit;
