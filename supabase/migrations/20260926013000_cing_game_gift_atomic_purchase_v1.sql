begin;

/*
 * ==========================================================
 * CING GAME CENTER V2
 * ATOMIC GIFT PURCHASE AUTHORITY V1
 * ==========================================================
 *
 * Two funding rails:
 * - wallet
 * - points
 *
 * Shared idempotency identity and gift receipt.
 *
 * No client-supplied:
 * - price
 * - Charm award
 * - gift name
 * - gift icon
 * - financial amount
 *
 * Both public RPCs remain dormant.
 *
 * No EXECUTE grant to service_role.
 * No HTTP route.
 * No catalog seed.
 * No existing Chess route modification.
 */

/* ==========================================================
 * SHARED PRIVATE FINANCIAL CORE
 * ========================================================== */

create function
public.cing_game_gift_purchase_private_v1(

  p_sender_user_id text,

  p_recipient_user_id text,

  p_gift_id text,

  p_request_id uuid,

  p_funding_source text

)

returns jsonb

language plpgsql

security definer

set search_path = public

as $function$

declare

  v_sender_id text;

  v_recipient_id text;

  v_gift_id text;

  v_sender
    public.players%rowtype;

  v_recipient
    public.players%rowtype;

  v_catalog
    public.cing_game_gift_catalog%rowtype;

  v_existing
    public.cing_game_gift_purchases%rowtype;

  v_wallet
    public.cing_wallet_transactions%rowtype;

  v_point_ledger
    public.point_transactions%rowtype;

  v_wallet_key text;

  v_points_cost integer;

  v_points_numeric numeric;

  v_points_before integer;

  v_points_after integer;

  v_charm_numeric numeric;

  v_charm_before bigint;

  v_charm_after bigint;

  v_now timestamptz :=
    clock_timestamp();

begin

  /* --------------------------------------------------------
   * Canonical input validation.
   * -------------------------------------------------------- */

  v_sender_id :=
    nullif(
      btrim(
        coalesce(
          p_sender_user_id,
          ''
        )
      ),
      ''
    );

  v_recipient_id :=
    nullif(
      btrim(
        coalesce(
          p_recipient_user_id,
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

  if v_sender_id is null then

    raise exception
      'GAME_GIFT_SENDER_REQUIRED'
      using errcode = '22023';

  end if;

  if v_recipient_id is null then

    raise exception
      'GAME_GIFT_RECIPIENT_REQUIRED'
      using errcode = '22023';

  end if;

  if v_sender_id = v_recipient_id then

    raise exception
      'GAME_GIFT_SELF_GIFT_FORBIDDEN'
      using errcode = '22023';

  end if;

  if v_gift_id is null then

    raise exception
      'GAME_GIFT_ID_REQUIRED'
      using errcode = '22023';

  end if;

  if p_request_id is null then

    raise exception
      'GAME_GIFT_REQUEST_ID_REQUIRED'
      using errcode = '22023';

  end if;

  if p_funding_source not in (
    'wallet',
    'points'
  )
  or p_funding_source is null
  then

    raise exception
      'GAME_GIFT_FUNDING_INVALID'
      using errcode = '22023';

  end if;

  /*
   * Establish a consistent player lock order.
   *
   * This serializes concurrent gifts and other
   * player-row financial mutations without locking
   * sender and recipient in opposite orders.
   */

  perform 1

  from public.players p

  where p.user_id in (

    v_sender_id,

    v_recipient_id

  )

  order by p.user_id

  for update;

  select *

  into v_sender

  from public.players p

  where p.user_id =
    v_sender_id;

  if not found then

    raise exception
      'GAME_GIFT_SENDER_NOT_FOUND'
      using errcode = 'P0002';

  end if;

  select *

  into v_recipient

  from public.players p

  where p.user_id =
    v_recipient_id;

  if not found then

    raise exception
      'GAME_GIFT_RECIPIENT_NOT_FOUND'
      using errcode = 'P0002';

  end if;

  /* --------------------------------------------------------
   * Historical replay.
   *
   * Do this before reading the current catalog.
   *
   * The gift can be disabled or repriced without
   * changing an already successful receipt.
   * -------------------------------------------------------- */

  select *

  into v_existing

  from public.cing_game_gift_purchases g

  where g.id =
    p_request_id;

  if found then

    if v_existing.sender_user_id
         <> v_sender_id

      or v_existing.recipient_user_id
         <> v_recipient_id

      or v_existing.gift_id
         <> v_gift_id

      or v_existing.funding_source
         <> p_funding_source

    then

      raise exception
        'GAME_GIFT_REQUEST_CONFLICT'
        using errcode = '23505';

    end if;

    if p_funding_source = 'wallet' then

      select *

      into v_wallet

      from public.cing_wallet_transactions wt

      where wt.id =
        v_existing.wallet_transaction_id;

      if not found then

        raise exception
          'GAME_GIFT_WALLET_LEDGER_MISSING'
          using errcode = '55000';

      end if;

      if v_wallet.user_id
           <> v_sender_id

        or v_wallet.transaction_type
           <> 'payment'

        or v_wallet.reference_type
           is distinct from
             'game_gift_purchase'

        or v_wallet.reference_id
           is distinct from
             p_request_id::text

        or v_wallet.amount
           <> -v_existing.price_vnd

      then

        raise exception
          'GAME_GIFT_WALLET_LEDGER_CONFLICT'
          using errcode = '55000';

      end if;

    else

      select *

      into v_point_ledger

      from public.point_transactions pt

      where pt.transaction_type =
        'deduct'

        and pt.metadata ->> 'source' =
          'cing_game_gift_purchase_v1'

        and pt.metadata ->> 'gift_purchase_id' =
          p_request_id::text;

      if not found then

        raise exception
          'GAME_GIFT_POINT_LEDGER_MISSING'
          using errcode = '55000';

      end if;

      if v_point_ledger.user_id
           <> v_sender_id

        or v_point_ledger.points
           <> -v_existing.points_cost

        or v_point_ledger.balance_before
           <> v_existing.points_balance_before

        or v_point_ledger.balance_after
           <> v_existing.points_balance_after

      then

        raise exception
          'GAME_GIFT_POINT_LEDGER_CONFLICT'
          using errcode = '55000';

      end if;

    end if;

    return jsonb_build_object(

      'applied',
      false,

      'request_id',
      v_existing.id,

      'sender_user_id',
      v_existing.sender_user_id,

      'recipient_user_id',
      v_existing.recipient_user_id,

      'gift_id',
      v_existing.gift_id,

      'gift_name',
      v_existing.gift_name,

      'gift_icon',
      v_existing.gift_icon,

      'funding_source',
      v_existing.funding_source,

      'price_vnd',
      v_existing.price_vnd,

      'points_cost',
      v_existing.points_cost,

      'charm_awarded',
      v_existing.charm_awarded,

      'charm_balance_after',
      v_existing.charm_balance_after,

      'points_balance_after',
      v_existing.points_balance_after,

      'wallet_transaction_id',
      v_existing.wallet_transaction_id,

      'ipos_sync_status',
      v_existing.ipos_sync_status

    );

  end if;

  /* --------------------------------------------------------
   * PostgreSQL-owned Gift Catalog.
   * -------------------------------------------------------- */

  select *

  into v_catalog

  from public.cing_game_gift_catalog c

  where c.id =
    v_gift_id

  for share;

  if not found

    or v_catalog.enabled
       is distinct from true

  then

    raise exception
      'GAME_GIFT_NOT_AVAILABLE'
      using errcode = '55000';

  end if;

  if v_catalog.price_vnd < 1000

    or mod(
      v_catalog.price_vnd,
      1000
    ) <> 0

    or v_catalog.price_vnd / 1000
       > 2147483647

  then

    raise exception
      'GAME_GIFT_PRICE_INVALID'
      using errcode = '55000';

  end if;

  v_points_cost :=
    (
      v_catalog.price_vnd / 1000
    )::integer;

  /* --------------------------------------------------------
   * Recipient Charm balance.
   * -------------------------------------------------------- */

  v_charm_numeric :=
    coalesce(
      v_recipient.charm_points,
      0
    );

  if v_charm_numeric <>
       trunc(v_charm_numeric)

    or v_charm_numeric < 0

    or v_charm_numeric
       > 9223372036854775807::numeric

  then

    raise exception
      'GAME_GIFT_CHARM_BALANCE_INVALID'
      using errcode = '55000';

  end if;

  if v_charm_numeric
       + v_catalog.charm_award::numeric
       > 9223372036854775807::numeric

  then

    raise exception
      'GAME_GIFT_CHARM_OVERFLOW'
      using errcode = '22003';

  end if;

  v_charm_before :=
    v_charm_numeric::bigint;

  v_charm_after :=
    v_charm_before
    + v_catalog.charm_award::bigint;

  /* --------------------------------------------------------
   * Funding rail A — Cing Wallet.
   * -------------------------------------------------------- */

  if p_funding_source = 'wallet' then

    v_wallet_key :=

      'game_gift_purchase:user:'

      || v_sender_id

      || ':request:'

      || p_request_id::text;

    /*
     * Lock Wallet account using established Wallet
     * serialization boundary.
     */

    insert into
      public.cing_wallet_accounts (
        user_id
      )

    values (
      v_sender_id
    )

    on conflict (
      user_id
    )

    do nothing;

    perform 1

    from public.cing_wallet_accounts a

    where a.user_id =
      v_sender_id

    for update;

    if not found then

      raise exception
        'GAME_GIFT_WALLET_NOT_FOUND'
        using errcode = '55000';

    end if;

    select *

    into v_wallet

    from public.cing_wallet_apply_mutation_private(

      v_sender_id,

      'payment',

      -v_catalog.price_vnd,

      v_wallet_key,

      'Tặng vật phẩm Cing Game Center',

      'game_gift_purchase',

      p_request_id::text,

      null::text,

      'game_gift_purchase_v1',

      null::text,

      jsonb_build_object(

        'source',
        'cing_game_gift_purchase_v1',

        'gift_purchase_id',
        p_request_id,

        'gift_id',
        v_catalog.id,

        'recipient_user_id',
        v_recipient_id,

        'price_vnd',
        v_catalog.price_vnd,

        'charm_awarded',
        v_catalog.charm_award

      )

    );

    if v_wallet.id is null

      or v_wallet.user_id
         <> v_sender_id

      or v_wallet.amount
         <> -v_catalog.price_vnd

    then

      raise exception
        'GAME_GIFT_WALLET_DEBIT_INVALID'
        using errcode = '55000';

    end if;

  /* --------------------------------------------------------
   * Funding rail B — Loyalty Points.
   * -------------------------------------------------------- */

  else

    v_points_numeric :=
      coalesce(
        v_sender.total_points,
        0
      );

    if v_points_numeric <>
         trunc(v_points_numeric)

      or v_points_numeric < 0

      or v_points_numeric
         > 2147483647

    then

      raise exception
        'GAME_GIFT_POINT_BALANCE_INVALID'
        using errcode = '55000';

    end if;

    v_points_before :=
      v_points_numeric::integer;

    if v_points_before
         < v_points_cost

    then

      raise exception
        'GAME_GIFT_INSUFFICIENT_POINTS'

        using

          errcode = 'P0001',

          detail =
            jsonb_build_object(

              'required_points',
              v_points_cost,

              'current_points',
              v_points_before

            )::text;

    end if;

    v_points_after :=
      v_points_before
      - v_points_cost;

    update public.players

    set total_points =
      v_points_after

    where user_id =
      v_sender_id;

    insert into
      public.point_transactions (

        user_id,

        order_id,

        transaction_type,

        points,

        balance_before,

        balance_after,

        reason,

        metadata

      )

    values (

      v_sender_id,

      null,

      'deduct',

      -v_points_cost,

      v_points_before,

      v_points_after,

      'Tặng vật phẩm Cing Game Center',

      jsonb_build_object(

        'source',
        'cing_game_gift_purchase_v1',

        'gift_purchase_id',
        p_request_id,

        'gift_id',
        v_catalog.id,

        'recipient_user_id',
        v_recipient_id,

        'price_vnd',
        v_catalog.price_vnd,

        'points_cost',
        v_points_cost,

        'charm_awarded',
        v_catalog.charm_award

      )

    );

  end if;

  /* --------------------------------------------------------
   * Award recipient Charm in the SAME transaction.
   * -------------------------------------------------------- */

  update public.players

  set charm_points =
    v_charm_after

  where user_id =
    v_recipient_id;

  /* --------------------------------------------------------
   * Immutable purchase receipt.
   *
   * Point-funded gift:
   *   durable iPOS MINUS obligation = pending.
   *
   * Wallet-funded gift:
   *   no loyalty point MINUS is required.
   * -------------------------------------------------------- */

  insert into
    public.cing_game_gift_purchases (

      id,

      sender_user_id,

      recipient_user_id,

      gift_id,

      gift_name,

      gift_icon,

      funding_source,

      price_vnd,

      points_cost,

      charm_awarded,

      wallet_transaction_id,

      points_balance_before,

      points_balance_after,

      charm_balance_before,

      charm_balance_after,

      ipos_sync_status,

      ipos_next_retry_at,

      created_at,

      updated_at

    )

  values (

    p_request_id,

    v_sender_id,

    v_recipient_id,

    v_catalog.id,

    v_catalog.name,

    v_catalog.icon,

    p_funding_source,

    v_catalog.price_vnd,

    case

      when p_funding_source =
        'points'

      then v_points_cost

      else null

    end,

    v_catalog.charm_award,

    case

      when p_funding_source =
        'wallet'

      then v_wallet.id

      else null

    end,

    case

      when p_funding_source =
        'points'

      then v_points_before

      else null

    end,

    case

      when p_funding_source =
        'points'

      then v_points_after

      else null

    end,

    v_charm_before,

    v_charm_after,

    case

      when p_funding_source =
        'points'

      then 'pending'

      else 'not_required'

    end,

    case

      when p_funding_source =
        'points'

      then v_now

      else null

    end,

    v_now,

    v_now

  );

  /* --------------------------------------------------------
   * Durable gift notification.
   *
   * Notification insert is part of this transaction.
   * No separate async second insert is permitted here.
   * -------------------------------------------------------- */

  insert into public.notifications (

    user_id,

    type,

    title,

    message,

    metadata,

    is_read

  )

  values (

    v_recipient_id,

    'gift_received',

    'Bạn nhận được vật phẩm '
      || v_catalog.name,

    '+'
      || v_catalog.charm_award::text
      || ' điểm quyến rũ',

    jsonb_build_object(

      'source',
      'cing_game_gift_purchase_v1',

      'gift_purchase_id',
      p_request_id,

      'fromUserId',
      v_sender_id,

      'toUserId',
      v_recipient_id,

      'giftId',
      v_catalog.id,

      'giftName',
      v_catalog.name,

      'giftIcon',
      v_catalog.icon,

      'charm',
      v_catalog.charm_award,

      'fundingSource',
      p_funding_source

    ),

    false

  );

  return jsonb_build_object(

    'applied',
    true,

    'request_id',
    p_request_id,

    'sender_user_id',
    v_sender_id,

    'recipient_user_id',
    v_recipient_id,

    'gift_id',
    v_catalog.id,

    'gift_name',
    v_catalog.name,

    'gift_icon',
    v_catalog.icon,

    'funding_source',
    p_funding_source,

    'price_vnd',
    v_catalog.price_vnd,

    'points_cost',

    case

      when p_funding_source =
        'points'

      then v_points_cost

      else null

    end,

    'charm_awarded',
    v_catalog.charm_award,

    'charm_balance_after',
    v_charm_after,

    'points_balance_after',

    case

      when p_funding_source =
        'points'

      then v_points_after

      else null

    end,

    'wallet_transaction_id',

    case

      when p_funding_source =
        'wallet'

      then v_wallet.id

      else null

    end,

    'ipos_sync_status',

    case

      when p_funding_source =
        'points'

      then 'pending'

      else 'not_required'

    end

  );

end;

$function$;

/* ==========================================================
 * TWO DISTINCT PUBLIC FUNDING RPCS
 * ========================================================== */

/*
 * Wallet gift.
 *
 * Funding source cannot be supplied by the client.
 */

create function
public.cing_game_gift_purchase_wallet_v1(

  p_sender_user_id text,

  p_recipient_user_id text,

  p_gift_id text,

  p_request_id uuid

)

returns jsonb

language plpgsql

security definer

set search_path = public

as $function$

begin

  return
    public.cing_game_gift_purchase_private_v1(

      p_sender_user_id,

      p_recipient_user_id,

      p_gift_id,

      p_request_id,

      'wallet'

    );

end;

$function$;

/*
 * Loyalty Points gift.
 *
 * Funding source cannot be supplied by the client.
 */

create function
public.cing_game_gift_purchase_points_v1(

  p_sender_user_id text,

  p_recipient_user_id text,

  p_gift_id text,

  p_request_id uuid

)

returns jsonb

language plpgsql

security definer

set search_path = public

as $function$

begin

  return
    public.cing_game_gift_purchase_private_v1(

      p_sender_user_id,

      p_recipient_user_id,

      p_gift_id,

      p_request_id,

      'points'

    );

end;

$function$;

/* ==========================================================
 * DORMANT SECURITY BOUNDARY
 * ========================================================== */

revoke all

on function
public.cing_game_gift_purchase_private_v1(
  text,
  text,
  text,
  uuid,
  text
)

from public, anon, authenticated, service_role;

revoke all

on function
public.cing_game_gift_purchase_wallet_v1(
  text,
  text,
  text,
  uuid
)

from public, anon, authenticated, service_role;

revoke all

on function
public.cing_game_gift_purchase_points_v1(
  text,
  text,
  text,
  uuid
)

from public, anon, authenticated, service_role;

commit;
