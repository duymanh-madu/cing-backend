begin;

/*
 * CING GAME CENTER V2
 * ADMIN GIFT CATALOG AUTHORITY V1
 *
 * Additive authority over the existing Gift Catalog.
 *
 * Admin requests are authorized by the backend
 * Super Admin middleware before calling this RPC.
 *
 * SQL remains the final catalog validation boundary.
 *
 * No public/service_role EXECUTE grant yet.
 * No catalog seed.
 * No purchase activation.
 */

create table
public.cing_game_gift_catalog_admin_audit (

  request_id uuid primary key,

  actor_id text not null,

  gift_id text not null,

  previous_snapshot jsonb,

  new_snapshot jsonb not null,

  created_at timestamptz
    not null default now(),

  constraint
    cing_game_gift_admin_actor_ck

    check (
      btrim(actor_id) <> ''
    ),

  constraint
    cing_game_gift_admin_gift_ck

    check (
      btrim(gift_id) <> ''
    ),

  constraint
    cing_game_gift_admin_new_snapshot_ck

    check (
      jsonb_typeof(new_snapshot) = 'object'
    ),

  constraint
    cing_game_gift_admin_previous_snapshot_ck

    check (
      previous_snapshot is null

      or jsonb_typeof(
        previous_snapshot
      ) = 'object'
    )

);

create index
cing_game_gift_catalog_admin_audit_gift_idx

on public.cing_game_gift_catalog_admin_audit (

  gift_id,

  created_at desc

);

/*
 * The catalog row is the present configuration.
 *
 * Purchase receipts already snapshot historical
 * name/icon/price/Charm independently.
 */

create function
public.cing_game_gift_catalog_admin_upsert_v1(

  p_actor_id text,

  p_request_id uuid,

  p_gift_id text,

  p_name text,

  p_icon text,

  p_price_vnd bigint,

  p_charm_award integer,

  p_enabled boolean

)

returns jsonb

language plpgsql

security definer

set search_path = public

as $function$

declare

  v_actor_id text;

  v_gift_id text;

  v_name text;

  v_icon text;

  v_existing
    public.cing_game_gift_catalog%rowtype;

  v_audit
    public.cing_game_gift_catalog_admin_audit%rowtype;

  v_previous jsonb;

  v_next jsonb;

  v_applied boolean := false;

begin

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

  v_gift_id :=
    nullif(
      btrim(
        coalesce(
          p_gift_id,
          ''
        )
      ),
      ''
    );

  v_name :=
    nullif(
      btrim(
        coalesce(
          p_name,
          ''
        )
      ),
      ''
    );

  v_icon :=
    nullif(
      btrim(
        coalesce(
          p_icon,
          ''
        )
      ),
      ''
    );

  if v_actor_id is null
    or length(v_actor_id) > 128
  then

    raise exception
      'GAME_GIFT_ADMIN_ACTOR_INVALID'
      using errcode = '22023';

  end if;

  if p_request_id is null then

    raise exception
      'GAME_GIFT_ADMIN_REQUEST_REQUIRED'
      using errcode = '22023';

  end if;

  if v_gift_id is null

    or v_gift_id !~
      '^[a-z0-9][a-z0-9_-]{0,63}$'

  then

    raise exception
      'GAME_GIFT_ADMIN_ID_INVALID'
      using errcode = '22023';

  end if;

  if v_name is null

    or length(v_name) > 120

    or v_icon is null

    or length(v_icon) > 64

  then

    raise exception
      'GAME_GIFT_ADMIN_PRESENTATION_INVALID'
      using errcode = '22023';

  end if;

  if p_price_vnd is null

    or p_price_vnd < 1000

    or mod(
      p_price_vnd,
      1000
    ) <> 0

    or p_price_vnd / 1000
       > 2147483647

  then

    raise exception
      'GAME_GIFT_ADMIN_PRICE_INVALID'
      using errcode = '22023';

  end if;

  if p_charm_award is null

    or p_charm_award <= 0

    or p_enabled is null

  then

    raise exception
      'GAME_GIFT_ADMIN_CONFIG_INVALID'
      using errcode = '22023';

  end if;

  v_next :=
    jsonb_build_object(

      'id',
      v_gift_id,

      'name',
      v_name,

      'icon',
      v_icon,

      'price_vnd',
      p_price_vnd,

      'points_cost',
      p_price_vnd / 1000,

      'charm_award',
      p_charm_award,

      'enabled',
      p_enabled

    );

  /*
   * Serialize requests sharing one idempotency ID
   * before checking audit.
   */

  perform pg_advisory_xact_lock(

    hashtextextended(
      p_request_id::text,
      0
    )

  );

  select *

  into v_audit

  from
    public.cing_game_gift_catalog_admin_audit

  where request_id =
    p_request_id;

  if found then

    if v_audit.actor_id
         <> v_actor_id

      or v_audit.gift_id
         <> v_gift_id

      or v_audit.new_snapshot
         <> v_next

    then

      raise exception
        'GAME_GIFT_ADMIN_REQUEST_CONFLICT'
        using errcode = '23505';

    end if;

    return jsonb_build_object(

      'applied',
      false,

      'request_id',
      p_request_id,

      'catalog',
      v_audit.new_snapshot

    );

  end if;

  /*
   * Catalog row lock prevents lost updates
   * for existing items.
   */

  select *

  into v_existing

  from public.cing_game_gift_catalog

  where id =
    v_gift_id

  for update;

  if found then

    v_previous :=
      jsonb_build_object(

        'id',
        v_existing.id,

        'name',
        v_existing.name,

        'icon',
        v_existing.icon,

        'price_vnd',
        v_existing.price_vnd,

        'points_cost',
        v_existing.price_vnd / 1000,

        'charm_award',
        v_existing.charm_award,

        'enabled',
        v_existing.enabled

      );

  else

    v_previous := null;

  end if;

  /*
   * Upsert preserves historical purchase receipts.
   *
   * No DELETE, no retroactive price mutation.
   */

  insert into
    public.cing_game_gift_catalog (

      id,

      name,

      icon,

      price_vnd,

      charm_award,

      enabled

    )

  values (

    v_gift_id,

    v_name,

    v_icon,

    p_price_vnd,

    p_charm_award,

    p_enabled

  )

  on conflict (id)

  do update

  set name =
    excluded.name,

    icon =
      excluded.icon,

    price_vnd =
      excluded.price_vnd,

    charm_award =
      excluded.charm_award,

    enabled =
      excluded.enabled;

  /*
   * Catalog mutation and Admin audit are
   * committed or rolled back together.
   */

  insert into
    public.cing_game_gift_catalog_admin_audit (

      request_id,

      actor_id,

      gift_id,

      previous_snapshot,

      new_snapshot

    )

  values (

    p_request_id,

    v_actor_id,

    v_gift_id,

    v_previous,

    v_next

  );

  v_applied := true;

  return jsonb_build_object(

    'applied',
    v_applied,

    'request_id',
    p_request_id,

    'catalog',
    v_next

  );

end;

$function$;

/*
 * Dormant until Admin HTTP integration
 * and isolated PostgreSQL gate pass.
 */

revoke all

on table
public.cing_game_gift_catalog_admin_audit

from public, anon, authenticated, service_role;

grant select

on table
public.cing_game_gift_catalog_admin_audit

to service_role;

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

commit;
