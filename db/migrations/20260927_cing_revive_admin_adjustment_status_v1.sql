begin;

/*
 * CING 4A.10-E1: Read-only, actor-scoped historical adjustment lookup.
 * An absent row is NOT proof that an in-flight adjustment cannot commit.
 * Not an adjustment, retry, or a request reservation.
 */
create function public.cing_revive_admin_adjustment_status_v1(
  p_request_id uuid,
  p_actor_admin_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_id text;
  v_count bigint;
  v_tx public.cing_revive_credit_transactions%rowtype;
begin
  v_actor_id := nullif(btrim(coalesce(p_actor_admin_id, '')), '');

  if p_request_id is null or v_actor_id is null then
    raise exception 'REVIVE_ADMIN_STATUS_ARGUMENT_INVALID'
      using errcode = '22023';
  end if;

  perform 1
  from public.admins a
  where a.id::text = v_actor_id
    and a.role = 'super_admin'
    and a.active is true;

  if not found then
    raise exception 'REVIVE_SUPER_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  /* The existing mutation's business ref is per user, not global.
   * Do not silently select an arbitrary result if an Admin reused
   * one request UUID for more than one user.
   */
  select count(*) into v_count
  from public.cing_revive_credit_transactions t
  where t.reference_type = 'revive_admin_adjustment_v1'
    and t.reference_id = p_request_id::text
    and t.metadata->>'source' = 'revive_admin_adjustment'
    and t.metadata->>'actor_id' = v_actor_id
    and t.metadata->>'request_id' = p_request_id::text;

  if v_count > 1 then
    raise exception 'REVIVE_ADMIN_STATUS_AMBIGUOUS'
      using errcode = '55000';
  end if;

  if v_count = 0 then
    return jsonb_build_object(
      'status', 'not_found',
      'request_id', p_request_id::text
    );
  end if;

  select t.* into strict v_tx
  from public.cing_revive_credit_transactions t
  where t.reference_type = 'revive_admin_adjustment_v1'
    and t.reference_id = p_request_id::text
    and t.metadata->>'source' = 'revive_admin_adjustment'
    and t.metadata->>'actor_id' = v_actor_id
    and t.metadata->>'request_id' = p_request_id::text;

  return jsonb_build_object(
    'status', 'found',
    'request_id', p_request_id::text,
    'transaction_id', v_tx.id::text,
    'user_id', v_tx.user_id,
    'amount', v_tx.amount,
    'balance_after', v_tx.balance_after,
    'reason_code', v_tx.metadata->>'reason_code',
    'created_at', v_tx.created_at
  );
end;
$function$;

revoke all on function public.cing_revive_admin_adjustment_status_v1(uuid,text)
from public, anon, authenticated, service_role;

grant execute on function public.cing_revive_admin_adjustment_status_v1(uuid,text)
to service_role;

commit;
