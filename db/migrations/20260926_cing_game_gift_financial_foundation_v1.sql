begin;

/*
 * ==========================================================
 * CING GAME CENTER V2
 * GAME GIFT FINANCIAL FOUNDATION V1
 * ==========================================================
 *
 * One catalog for both funding rails:
 *
 * Cing Wallet: VND
 * Loyalty points: price_vnd / 1000
 *
 * No default price.
 * No gift is inserted or activated by this migration.
 * No gift payment RPC is created in this migration.
 * No existing Chess gift flow is modified.
 */

create table public.cing_game_gift_catalog (

  id text primary key,

  name text not null,

  icon text not null,

  price_vnd bigint not null,

  charm_award integer not null,

  enabled boolean not null
    default false,

  created_at timestamptz not null
    default clock_timestamp(),

  updated_at timestamptz not null
    default clock_timestamp(),

  constraint
    cing_game_gift_catalog_id_ck
  check (

    id = btrim(id)

    and length(id) between 1 and 64

    and id ~ '^[a-z0-9][a-z0-9_-]*$'

  ),

  constraint
    cing_game_gift_catalog_name_ck
  check (

    length(btrim(name))
      between 1 and 120

  ),

  constraint
    cing_game_gift_catalog_icon_ck
  check (

    length(btrim(icon))
      between 1 and 40

  ),

  constraint
    cing_game_gift_catalog_price_ck
  check (

    price_vnd >= 1000

    and mod(
      price_vnd,
      1000
    ) = 0

    and price_vnd / 1000
      <= 2147483647

  ),

  constraint
    cing_game_gift_catalog_charm_ck
  check (

    charm_award > 0

  )

);

/*
 * One immutable purchase identity.
 *
 * This row is created by a future single-transaction
 * Wallet or Points Gift RPC.
 *
 * No separate financial step may create a successful
 * gift without its funding ledger and recipient award.
 */

create table public.cing_game_gift_purchases (

  id uuid primary key,

  sender_user_id text not null,

  recipient_user_id text not null,

  gift_id text not null,

  gift_name text not null,

  gift_icon text not null,

  funding_source text not null,

  price_vnd bigint not null,

  points_cost integer,

  charm_awarded integer not null,

  wallet_transaction_id uuid,

  points_balance_before integer,

  points_balance_after integer,

  charm_balance_before bigint not null,

  charm_balance_after bigint not null,

  ipos_sync_status text not null,

  ipos_retry_count integer not null
    default 0,

  ipos_next_retry_at timestamptz,

  ipos_locked_until timestamptz,

  ipos_first_attempt_at timestamptz,

  ipos_synced_at timestamptz,

  ipos_last_error text,

  created_at timestamptz not null
    default clock_timestamp(),

  updated_at timestamptz not null
    default clock_timestamp(),

  constraint
    cing_game_gift_sender_ck
  check (

    length(
      btrim(sender_user_id)
    ) > 0

  ),

  constraint
    cing_game_gift_recipient_ck
  check (

    length(
      btrim(recipient_user_id)
    ) > 0

  ),

  constraint
    cing_game_gift_distinct_users_ck
  check (

    sender_user_id <>
      recipient_user_id

  ),

  constraint
    cing_game_gift_id_ck
  check (

    length(
      btrim(gift_id)
    ) > 0

  ),

  constraint
    cing_game_gift_snapshot_name_ck
  check (

    length(
      btrim(gift_name)
    ) > 0

  ),

  constraint
    cing_game_gift_snapshot_icon_ck
  check (

    length(
      btrim(gift_icon)
    ) > 0

  ),

  constraint
    cing_game_gift_funding_ck
  check (

    funding_source in (

      'wallet',

      'points'

    )

  ),

  constraint
    cing_game_gift_price_ck
  check (

    price_vnd >= 1000

    and mod(
      price_vnd,
      1000
    ) = 0

    and price_vnd / 1000
      <= 2147483647

  ),

  constraint
    cing_game_gift_charm_award_ck
  check (

    charm_awarded > 0

  ),

  constraint
    cing_game_gift_charm_balance_ck
  check (

    charm_balance_before >= 0

    and charm_balance_after =
      charm_balance_before
      + charm_awarded::bigint

  ),

  constraint
    cing_game_gift_funding_ledger_ck
  check (

    (
      funding_source = 'wallet'

      and wallet_transaction_id
        is not null

      and points_cost is null

      and points_balance_before
        is null

      and points_balance_after
        is null
    )

    or

    (
      funding_source = 'points'

      and wallet_transaction_id
        is null

      and points_cost is not null

      and points_cost =
        price_vnd / 1000

      and points_balance_before
        is not null

      and points_balance_after
        is not null

      and points_balance_after =
        points_balance_before
        - points_cost

      and points_balance_after >= 0
    )

  ),

  constraint
    cing_game_gift_ipos_status_ck
  check (

    (
      funding_source = 'wallet'

      and ipos_sync_status =
        'not_required'
    )

    or

    (
      funding_source = 'points'

      and ipos_sync_status in (

        'pending',

        'processing',

        'synced',

        'failed'

      )

    )

  ),

  constraint
    cing_game_gift_retry_ck
  check (

    ipos_retry_count >= 0

  )

);

/*
 * The wallet reference cannot belong to two gifts.
 *
 * The purchase UUID itself is the idempotency boundary
 * shared by both funding rails.
 */

create unique index
  cing_game_gift_wallet_tx_uq

on public.cing_game_gift_purchases (

  wallet_transaction_id

)

where wallet_transaction_id
  is not null;

/*
 * Durable iPOS queue for point-funded gifts.
 *
 * A separate, authorized delivery worker must be
 * installed before point-funded gift RPC activation.
 */

create index
  cing_game_gift_ipos_pending_idx

on public.cing_game_gift_purchases (

  ipos_next_retry_at,

  created_at

)

where

  funding_source = 'points'

  and ipos_sync_status =
    'pending';

/*
 * Snapshot protection will use this index once
 * the gift source is included in the guarded
 * CRM authority.
 */

create index
  cing_game_gift_ipos_protection_idx

on public.cing_game_gift_purchases (

  sender_user_id,

  ipos_sync_status

)

where

  funding_source = 'points'

  and ipos_sync_status in (

    'pending',

    'processing',

    'failed'

  );

/*
 * Exactly-once permanent loyalty ledger.
 *
 * No existing Commerce or Continue ledger is changed.
 */

create unique index
  cing_point_tx_game_gift_v1_uq

on public.point_transactions (

  (
    metadata ->> 'gift_purchase_id'
  )

)

where

  transaction_type =
    'deduct'

  and metadata ->> 'source' =
    'cing_game_gift_purchase_v1';

/*
 * Purchase history is available to the backend only.
 *
 * Backend service_ROLE cannot write catalog or
 * purchase rows through the table API.
 *
 * Future financial functions must be
 * SECURITY DEFINER and explicitly granted
 * only after complete financial integration.
 */

revoke all
on table
  public.cing_game_gift_catalog
from public, anon, authenticated, service_role;

revoke all
on table
  public.cing_game_gift_purchases
from public, anon, authenticated, service_role;

grant select
on table
  public.cing_game_gift_catalog
to service_role;

grant select
on table
  public.cing_game_gift_purchases
to service_role;

commit;
