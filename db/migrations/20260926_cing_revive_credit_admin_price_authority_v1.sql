begin;

/*
 * CING GAME CENTER V2
 * REVIVE CREDIT ADMIN PRICE AUTHORITY V1
 *
 * Existing price:
 *
 * public.app_configs.wallet_revive_credit_price
 *
 * NULL = purchases disabled / not configured.
 *
 * One VND price for BOTH Wallet and Points rails.
 *
 * Points cost = price_vnd / 1000.
 *
 * No new price column.
 * No default price.
 * No purchase route activation.
 * No Wallet / Points / Credit mutation.
 *
 * Backend must verify Super Admin before
 * invoking this RPC.
 *
 * This function remains dormant until
 * explicit release authorization.
 */

create table
public.cing_revive_credit_admin_price_audit (

  request_id uuid primary key,

  actor_id text not null,

  config_id integer not null,

  previous_price_vnd bigint,

  new_price_vnd bigint,

  created_at timestamptz
    not null default now(),

  constraint
    cing_revive_admin_price_actor_ck

    check (
      btrim(actor_id) <> ''
    ),

  constraint
    cing_revive_admin_price_config_ck

    check (
      config_id = 1
    ),

  constraint
    cing_revive_admin_previous_price_ck

    check (
      previous_price_vnd is null

      or (
        previous_price_vnd >= 1000

        and mod(
          previous_price_vnd,
          1000
        ) = 0
      )
    ),

  constraint
    cing_revive_admin_new_price_ck

    check (
      new_price_vnd is null

      or (
        new_price_vnd >= 1000

        and mod(
          new_price_vnd,
          1000
        ) = 0

        and new_price_vnd / 1000
          <= 2147483647
      )
    )

);

create index
cing_revive_admin_price_audit_created_idx

on public.cing_revive_credit_admin_price_audit (

  created_at desc,

  request_id

);

/*
 * The application-level Admin middleware
 * owns role authorization.
 *
 * PostgreSQL owns:
 *
 * - input constraints
 * - atomic configuration mutation
 * - idempotency
 * - historical audit
 * - concurrent request serialization
 */

create function
public.cing_revive_credit_admin_set_price_v1 (

  p_actor_id text,

  p_request_id uuid,

  p_price_vnd bigint

)

returns jsonb

language plpgsql

security definer

set search_path = public

as $function$

declare

  v_actor_id text;

  v_existing
    public.cing_revive_credit_admin_price_audit%rowtype;

  v_previous_price bigint;

  v_points_cost bigint;

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

  if v_actor_id is null

    or length(v_actor_id) > 128

  then

    raise exception
      'REVIVE_ADMIN_ACTOR_INVALID'

      using errcode = '22023';

  end if;

  if p_request_id is null then

    raise exception
      'REVIVE_ADMIN_REQUEST_REQUIRED'

      using errcode = '22023';

  end if;

  /*
   * NULL intentionally disables purchases.
   *
   * Otherwise, use exactly the same
   * VND / 1000 pricing contract
   * as the Points purchase authority.
   */

  if p_price_vnd is not null then

    if p_price_vnd < 1000

      or mod(
        p_price_vnd,
        1000
      ) <> 0

      or p_price_vnd / 1000
        > 2147483647

    then

      raise exception
        'REVIVE_ADMIN_PRICE_INVALID'

        using errcode = '22023';

    end if;

  end if;

  /*
   * Serialize concurrent calls using
   * the same idempotency key.
   */

  perform pg_advisory_xact_lock(

    hashtextextended(

      'cing_revive_admin_price:'
        || p_request_id::text,

      0

    )

  );

  /*
   * Replay BEFORE reading the current price.
   *
   * The historical result must survive
   * later Admin price changes.
   */

  select *

  into v_existing

  from
    public.cing_revive_credit_admin_price_audit

  where request_id =
    p_request_id;

  if found then

    if v_existing.actor_id
         <> v_actor_id

      or v_existing.new_price_vnd
         is distinct from p_price_vnd

    then

      raise exception
        'REVIVE_ADMIN_REQUEST_CONFLICT'

        using errcode = '23505';

    end if;

    return jsonb_build_object(

      'applied',
      false,

      'request_id',
      p_request_id,

      'previous_price_vnd',
      v_existing.previous_price_vnd,

      'price_vnd',
      v_existing.new_price_vnd,

      'points_cost',

        case

          when v_existing.new_price_vnd
            is null

          then null

          else
            v_existing.new_price_vnd / 1000

        end,

      'enabled',
      v_existing.new_price_vnd is not null

    );

  end if;

  /*
   * One canonical app_configs row.
   *
   * Its row lock serializes distinct
   * Admin requests updating this price.
   */

  select
    wallet_revive_credit_price

  into
    v_previous_price

  from public.app_configs

  where id = 1

  for update;

  if not found then

    raise exception
      'REVIVE_ADMIN_CONFIG_NOT_FOUND'

      using errcode = 'P0002';

  end if;

  /*
   * Exactly one price mutation.
   *
   * The legacy wallet_play_price
   * is intentionally untouched.
   */

  update public.app_configs

  set wallet_revive_credit_price =
    p_price_vnd

  where id = 1;

  /*
   * Mutation and audit share one
   * PostgreSQL transaction.
   */

  insert into
    public.cing_revive_credit_admin_price_audit (

      request_id,

      actor_id,

      config_id,

      previous_price_vnd,

      new_price_vnd

    )

  values (

    p_request_id,

    v_actor_id,

    1,

    v_previous_price,

    p_price_vnd

  );

  v_points_cost :=

    case

      when p_price_vnd is null
      then null

      else p_price_vnd / 1000

    end;

  return jsonb_build_object(

    'applied',
    true,

    'request_id',
    p_request_id,

    'previous_price_vnd',
    v_previous_price,

    'price_vnd',
    p_price_vnd,

    'points_cost',
    v_points_cost,

    'enabled',
    p_price_vnd is not null

  );

end;

$function$;

/*
 * Read-only audit access for the backend.
 *
 * No direct mutation access.
 */

revoke all

on table
public.cing_revive_credit_admin_price_audit

from public, anon, authenticated, service_role;

grant select

on table
public.cing_revive_credit_admin_price_audit

to service_role;

/*
 * No EXECUTE grant.
 *
 * Remains dormant until Admin middleware,
 * UI and isolated PostgreSQL gates pass.
 */

revoke all

on function
public.cing_revive_credit_admin_set_price_v1(
  text,
  uuid,
  bigint
)

from public, anon, authenticated, service_role;

commit;
