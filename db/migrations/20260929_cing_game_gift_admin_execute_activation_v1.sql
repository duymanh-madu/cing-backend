begin;

/*
 * ==========================================================
 * CING GAME CENTER V2
 * GIFT CATALOG ADMIN EXECUTE ACTIVATION V1
 * ==========================================================
 *
 * Activate only:
 *
 *   cing_game_gift_catalog_admin_upsert_v1
 *
 * for backend service_role.
 *
 * Deliberately NOT activated:
 *
 * - cing_game_gift_purchase_private_v1
 * - cing_game_gift_purchase_wallet_v1
 * - cing_game_gift_purchase_points_v1
 *
 * HTTP/UI gates remain separate release controls.
 *
 * This migration does not mutate Gift catalog rows.
 */

do $$
begin
  if to_regprocedure(
    'public.cing_game_gift_catalog_admin_upsert_v1(text,uuid,text,text,text,bigint,integer,boolean)'
  ) is null then
    raise exception
      'CING_GAME_GIFT_ADMIN_UPSERT_RPC_MISSING';
  end if;
end
$$;

revoke all
on function
public.cing_game_gift_catalog_admin_upsert_v1(
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  integer,
  boolean
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_game_gift_catalog_admin_upsert_v1(
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  integer,
  boolean
)
to service_role;

/*
 * Postcondition:
 *
 * service_role can call the Admin catalog RPC;
 * public client roles cannot.
 */
do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.cing_game_gift_catalog_admin_upsert_v1(text,uuid,text,text,text,bigint,integer,boolean)',
    'EXECUTE'
  ) then
    raise exception
      'CING_GAME_GIFT_ADMIN_SERVICE_ROLE_EXECUTE_MISSING';
  end if;

  if has_function_privilege(
    'anon',
    'public.cing_game_gift_catalog_admin_upsert_v1(text,uuid,text,text,text,bigint,integer,boolean)',
    'EXECUTE'
  ) then
    raise exception
      'CING_GAME_GIFT_ADMIN_ANON_EXECUTE_FORBIDDEN';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_game_gift_catalog_admin_upsert_v1(text,uuid,text,text,text,bigint,integer,boolean)',
    'EXECUTE'
  ) then
    raise exception
      'CING_GAME_GIFT_ADMIN_AUTHENTICATED_EXECUTE_FORBIDDEN';
  end if;
end
$$;

commit;
