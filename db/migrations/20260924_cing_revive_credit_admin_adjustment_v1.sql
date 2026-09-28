begin;

/*
 * CING GAME CENTER V2
 * SUPER ADMIN REVIVE CREDIT ADJUSTMENT V1
 *
 * Installed but not invoked by this migration.
 *
 * This authority:
 * - validates the current active Super Admin;
 * - applies one signed Revive Credit adjustment;
 * - records immutable actor/reason/reference metadata;
 * - uses the existing atomic private mutation;
 * - rejects conflicting request retries.
 *
 * No Wallet, loyalty point, iPOS or legacy
 * game_plays mutation.
 */

create function
public.cing_revive_credit_admin_adjust_v1(

  p_user_id text,

  p_amount integer,

  p_request_id uuid,

  p_reason_code text,

  p_note text,

  p_reference_type text,

  p_reference_id text,

  p_actor_admin_id text

)

returns table (

  applied boolean,

  transaction_id bigint,

  balance_after integer

)

language plpgsql

security definer

set search_path = public

as $function$

declare

  v_user_id text;

  v_reason_code text;

  v_note text;

  v_reference_type text;

  v_reference_id text;

  v_actor_id text;

  v_reason text;

  v_metadata jsonb;

  v_result record;

begin

  v_user_id :=
    nullif(btrim(coalesce(p_user_id, '')), '');

  v_reason_code :=
    nullif(btrim(coalesce(p_reason_code, '')), '');

  v_note :=
    nullif(btrim(coalesce(p_note, '')), '');

  v_actor_id :=
    nullif(btrim(coalesce(p_actor_admin_id, '')), '');

  if v_user_id is null then

    raise exception
      'REVIVE_ADMIN_USER_REQUIRED'
      using errcode = '22023';

  end if;

  if p_amount is null or p_amount = 0 then

    raise exception
      'REVIVE_ADMIN_AMOUNT_INVALID'
      using errcode = '22023';

  end if;

  if p_request_id is null then

    raise exception
      'REVIVE_ADMIN_REQUEST_ID_REQUIRED'
      using errcode = '22023';

  end if;

  if v_reason_code is null
    or length(v_reason_code) > 80
  then

    raise exception
      'REVIVE_ADMIN_REASON_CODE_INVALID'
      using errcode = '22023';

  end if;

  if v_note is null
    or length(v_note) > 500
  then

    raise exception
      'REVIVE_ADMIN_NOTE_INVALID'
      using errcode = '22023';

  end if;

  if v_actor_id is null then

    raise exception
      'REVIVE_ADMIN_ACTOR_REQUIRED'
      using errcode = '22023';

  end if;

  /*
   * The backend supplies this ID after verifying
   * the Admin Panel JWT and reloading the active
   * admin row.
   *
   * PostgreSQL checks that the same actor remains
   * an active Super Admin when the mutation runs.
   */

  perform 1

  from public.admins a

  where a.id::text = v_actor_id

    and a.role = 'super_admin'

    and a.active is true;

  if not found then

    raise exception
      'REVIVE_SUPER_ADMIN_REQUIRED'
      using errcode = '42501';

  end if;

  /*
   * External reference is optional as a pair.
   * If supplied, both fields must be present.
   */

  v_reference_type :=
    nullif(btrim(coalesce(p_reference_type, '')), '');

  v_reference_id :=
    nullif(btrim(coalesce(p_reference_id, '')), '');

  if (v_reference_type is null)
      <> (v_reference_id is null)
  then

    raise exception
      'REVIVE_ADMIN_REFERENCE_INVALID'
      using errcode = '22023';

  end if;

  if length(coalesce(v_reference_type, '')) > 80
    or length(coalesce(v_reference_id, '')) > 160
  then

    raise exception
      'REVIVE_ADMIN_REFERENCE_INVALID'
      using errcode = '22023';

  end if;

  v_reason :=
    'Admin Revive Credit adjustment: '
    || v_reason_code;

  v_metadata :=
    jsonb_build_object(

      'source',
      'revive_admin_adjustment',

      'actor_type',
      'admin',

      'actor_id',
      v_actor_id,

      'reason_code',
      v_reason_code,

      'note',
      v_note,

      'request_id',
      p_request_id,

      'reference_type',
      v_reference_type,

      'reference_id',
      v_reference_id

    );

  /*
   * One stable business reference per user/request.
   *
   * The private mutation validates all fields on
   * retry. Changed amount, actor, reason or note
   * produces REVIVE_REFERENCE_CONFLICT.
   */

  select *

  into v_result

  from public.cing_revive_credit_apply_private_v1(

    v_user_id,

    p_amount,

    v_reason,

    'revive_admin_adjustment_v1',

    p_request_id::text,

    null::text,

    null::uuid,

    v_metadata

  );

  if not found then

    raise exception
      'REVIVE_ADMIN_MUTATION_RESULT_MISSING'
      using errcode = '55000';

  end if;

  return query

  select

    v_result.applied,

    v_result.transaction_id,

    v_result.balance_after;

end;

$function$;

/*
 * Customer roles and PUBLIC must never invoke
 * a Super Admin balance adjustment.
 *
 * service_role access is reserved for the backend
 * HTTP authorization boundary, not the client.
 */

revoke all

on function
public.cing_revive_credit_admin_adjust_v1(

  text,
  integer,
  uuid,
  text,
  text,
  text,
  text,
  text

)

from public, anon, authenticated, service_role;

grant execute

on function
public.cing_revive_credit_admin_adjust_v1(

  text,
  integer,
  uuid,
  text,
  text,
  text,
  text,
  text

)

to service_role;

commit;
