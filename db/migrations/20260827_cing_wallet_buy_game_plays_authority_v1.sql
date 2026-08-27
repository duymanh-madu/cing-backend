begin;

/*
 * ==========================================================
 * CING WALLET — BUY GAME PLAYS AUTHORITY V1
 * ==========================================================
 *
 * Adds one new closed-loop Wallet capability:
 *
 *   Cing Wallet balance
 *          ↓
 *   purchase game plays
 *
 * Scope is deliberately isolated.
 *
 * This migration DOES NOT modify:
 * - loyalty-point buy-plays flow
 * - Daily Mission
 * - Daily Challenge
 * - leaderboard rewards
 * - notification flows
 * - commerce spend-per-play rewards
 *
 * Financial mutation reuses the proven private Wallet
 * mutation authority.
 */


/* ----------------------------------------------------------
 * 1. Wallet play-price policy.
 *
 * NULL intentionally means "not configured / disabled".
 * There is NO hardcoded production price.
 * ---------------------------------------------------------- */

alter table public.app_configs
  add column if not exists wallet_play_price bigint;

alter table public.app_configs
  add constraint app_configs_wallet_play_price_positive_ck
  check (
    wallet_play_price is null
    or wallet_play_price > 0
  )
  not valid;


/* ----------------------------------------------------------
 * 2. Exactly one game-play ledger row for one Wallet purchase.
 *
 * reference_id is the canonical Wallet transaction UUID.
 * ---------------------------------------------------------- */

create unique index
  game_play_transactions_wallet_purchase_uq
on public.game_play_transactions (
  reference_type,
  reference_id
)
where
  reference_type = 'wallet_play_purchase'
  and reference_id is not null;


/* ----------------------------------------------------------
 * 3. Atomic Wallet -> game plays authority.
 *
 * Caller supplies:
 * - canonical backend user identity
 * - quantity
 * - stable UUID request identity
 *
 * Caller NEVER supplies:
 * - unit price
 * - total cost
 * - Wallet balance
 * - game-play balance
 * ---------------------------------------------------------- */

create or replace function
public.cing_wallet_purchase_game_plays_atomic_v1(
  p_user_id text,
  p_quantity integer,
  p_request_id uuid
)
returns table (
  applied boolean,
  request_id uuid,
  wallet_transaction_id uuid,
  quantity integer,
  unit_price bigint,
  total_cost bigint,
  wallet_balance_after bigint,
  game_plays_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_idempotency_key text;
  v_reference_id text;

  v_unit_price bigint;
  v_total_cost bigint;

  v_existing_wallet_tx
    public.cing_wallet_transactions%rowtype;

  v_wallet_tx
    public.cing_wallet_transactions%rowtype;

  v_existing_play_tx
    public.game_play_transactions%rowtype;

  v_player
    public.players%rowtype;

  v_game_plays_before integer;
  v_game_plays_after_big bigint;
  v_game_plays_after integer;

  v_snapshot_quantity integer;
  v_snapshot_unit_price bigint;
  v_snapshot_total_cost bigint;
begin

  v_user_id :=
    nullif(
      btrim(
        coalesce(
          p_user_id,
          ''
        )
      ),
      ''
    );

  if v_user_id is null then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_USER_REQUIRED'
      using errcode = '22023';
  end if;


  if p_quantity is null
     or p_quantity <= 0
  then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_QUANTITY_INVALID'
      using errcode = '22023';
  end if;


  if p_request_id is null then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;


  v_reference_id :=
    p_request_id::text;

  v_idempotency_key :=
    'wallet_play_purchase:user:'
    || v_user_id
    || ':request:'
    || v_reference_id;


  /*
   * --------------------------------------------------------
   * Durable replay path.
   *
   * Price is NOT re-read here.
   *
   * A retry must replay the immutable original purchase even
   * if admin changes wallet_play_price afterwards.
   * --------------------------------------------------------
   */

  select *
    into v_existing_wallet_tx
    from public.cing_wallet_transactions wt
   where wt.idempotency_key =
     v_idempotency_key;

  if found then

    if v_existing_wallet_tx.user_id <>
         v_user_id
       or v_existing_wallet_tx.transaction_type <>
         'payment'
       or v_existing_wallet_tx.reference_type is distinct from
         'game_play_purchase'
       or v_existing_wallet_tx.reference_id is distinct from
         v_reference_id
    then
      raise exception
        'CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT'
        using errcode = '23505';
    end if;


    begin
      v_snapshot_quantity :=
        (
          v_existing_wallet_tx.metadata
            ->> 'quantity'
        )::integer;

      v_snapshot_unit_price :=
        (
          v_existing_wallet_tx.metadata
            ->> 'unit_price'
        )::bigint;

      v_snapshot_total_cost :=
        (
          v_existing_wallet_tx.metadata
            ->> 'total_cost'
        )::bigint;
    exception
      when others then
        raise exception
          'CING_WALLET_PLAY_PURCHASE_SNAPSHOT_INVALID'
          using errcode = '55000';
    end;


    if v_snapshot_quantity <> p_quantity
       or v_snapshot_quantity <= 0
       or v_snapshot_unit_price <= 0
       or v_snapshot_total_cost <= 0
       or v_snapshot_total_cost <>
            (
              v_snapshot_unit_price
              * v_snapshot_quantity::bigint
            )
       or v_existing_wallet_tx.amount <>
            -v_snapshot_total_cost
    then
      raise exception
        'CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT'
        using errcode = '23505';
    end if;


    select *
      into v_existing_play_tx
      from public.game_play_transactions gt
     where gt.reference_type =
       'wallet_play_purchase'
       and gt.reference_id =
         v_existing_wallet_tx.id::text;

    if not found then
      raise exception
        'CING_WALLET_PLAY_PURCHASE_LEDGER_MISSING'
        using errcode = '55000';
    end if;


    if v_existing_play_tx.user_id <>
         v_user_id
       or v_existing_play_tx.transaction_type <>
         'add'
       or v_existing_play_tx.amount <>
         v_snapshot_quantity
    then
      raise exception
        'CING_WALLET_PLAY_PURCHASE_LEDGER_CONFLICT'
        using errcode = '55000';
    end if;


    return query
    select
      false,
      p_request_id,
      v_existing_wallet_tx.id,
      v_snapshot_quantity,
      v_snapshot_unit_price,
      v_snapshot_total_cost,
      v_existing_wallet_tx.balance_after,
      v_existing_play_tx.balance_after;

    return;
  end if;


  /*
   * --------------------------------------------------------
   * New purchase policy.
   *
   * wallet_play_price is intentionally independent from
   * spend_per_play.
   * --------------------------------------------------------
   */

  select ac.wallet_play_price
    into v_unit_price
    from public.app_configs ac
   where ac.id = 1;

  if not found then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_CONFIG_MISSING'
      using errcode = '55000';
  end if;


  if v_unit_price is null
     or v_unit_price <= 0
  then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_PRICE_NOT_CONFIGURED'
      using errcode = '55000';
  end if;


  begin
    v_total_cost :=
      v_unit_price
      * p_quantity::bigint;
  exception
    when numeric_value_out_of_range then
      raise exception
        'CING_WALLET_PLAY_PURCHASE_COST_OVERFLOW'
        using errcode = '22003';
  end;


  if v_total_cost <= 0 then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_COST_INVALID'
      using errcode = '55000';
  end if;


  /*
   * --------------------------------------------------------
   * Financial mutation.
   *
   * The private Wallet authority:
   * - verifies canonical player
   * - materializes Wallet lazily
   * - locks Wallet row
   * - rechecks global idempotency after lock
   * - rejects insufficient funds
   * - writes durable Wallet ledger
   * - updates Wallet balance
   *
   * Its row lock remains held until this outer transaction
   * completes.
   * --------------------------------------------------------
   */

  select *
    into v_wallet_tx
    from public.cing_wallet_apply_mutation_private(
      v_user_id,
      'payment',
      -v_total_cost,
      v_idempotency_key,
      'Mua lượt chơi game bằng Cing Wallet',
      'game_play_purchase',
      v_reference_id,
      null,
      'wallet_play_purchase',
      null,
      jsonb_build_object(
        'source',
        'wallet_play_purchase',

        'request_id',
        p_request_id,

        'quantity',
        p_quantity,

        'unit_price',
        v_unit_price,

        'total_cost',
        v_total_cost
      )
    );


  /*
   * Concurrent identical request may have waited on the Wallet
   * row and received the already-created Wallet transaction.
   *
   * If its game-play ledger already exists, this is a replay,
   * never a second credit.
   */

  select *
    into v_existing_play_tx
    from public.game_play_transactions gt
   where gt.reference_type =
     'wallet_play_purchase'
     and gt.reference_id =
       v_wallet_tx.id::text;

  if found then

    if v_existing_play_tx.user_id <>
         v_user_id
       or v_existing_play_tx.transaction_type <>
         'add'
       or v_existing_play_tx.amount <>
         p_quantity
    then
      raise exception
        'CING_WALLET_PLAY_PURCHASE_LEDGER_CONFLICT'
        using errcode = '55000';
    end if;


    return query
    select
      false,
      p_request_id,
      v_wallet_tx.id,
      p_quantity,
      v_unit_price,
      v_total_cost,
      v_wallet_tx.balance_after,
      v_existing_play_tx.balance_after;

    return;
  end if;


  /*
   * --------------------------------------------------------
   * Game-play mutation.
   *
   * Lock the same canonical player whose Wallet was debited.
   * If anything below fails, PostgreSQL rolls back BOTH the
   * Wallet debit and the game-play credit.
   * --------------------------------------------------------
   */

  select *
    into v_player
    from public.players p
   where p.user_id =
     v_user_id
   for update;

  if not found then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  v_game_plays_before :=
    coalesce(
      v_player.game_plays,
      0
    );


  if v_game_plays_before < 0 then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_PLAY_BALANCE_INVALID'
      using errcode = '55000';
  end if;


  v_game_plays_after_big :=
    v_game_plays_before::bigint
    + p_quantity::bigint;


  if v_game_plays_after_big >
       2147483647::bigint
  then
    raise exception
      'CING_WALLET_PLAY_PURCHASE_PLAY_BALANCE_OVERFLOW'
      using errcode = '22003';
  end if;


  v_game_plays_after :=
    v_game_plays_after_big::integer;


  update public.players
     set game_plays =
       v_game_plays_after
   where user_id =
     v_user_id;


  insert into public.game_play_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    reason,
    reference_type,
    reference_id,
    metadata
  )
  values (
    v_user_id,
    'add',
    p_quantity,
    v_game_plays_before,
    v_game_plays_after,
    'Mua lượt chơi bằng Cing Wallet',
    'wallet_play_purchase',
    v_wallet_tx.id::text,
    jsonb_build_object(
      'source',
      'wallet_play_purchase',

      'request_id',
      p_request_id,

      'wallet_transaction_id',
      v_wallet_tx.id,

      'quantity',
      p_quantity,

      'unit_price',
      v_unit_price,

      'total_cost',
      v_total_cost
    )
  );


  return query
  select
    true,
    p_request_id,
    v_wallet_tx.id,
    p_quantity,
    v_unit_price,
    v_total_cost,
    v_wallet_tx.balance_after,
    v_game_plays_after;

end;
$$;


/* ----------------------------------------------------------
 * Backend-only domain authority.
 *
 * Private generic Wallet mutation stays private.
 * ---------------------------------------------------------- */

revoke all
  on function
  public.cing_wallet_purchase_game_plays_atomic_v1(
    text,
    integer,
    uuid
  )
  from public;

revoke all
  on function
  public.cing_wallet_purchase_game_plays_atomic_v1(
    text,
    integer,
    uuid
  )
  from anon;

revoke all
  on function
  public.cing_wallet_purchase_game_plays_atomic_v1(
    text,
    integer,
    uuid
  )
  from authenticated;

grant execute
  on function
  public.cing_wallet_purchase_game_plays_atomic_v1(
    text,
    integer,
    uuid
  )
  to service_role;


/* ----------------------------------------------------------
 * Structural dependency assertion.
 * ---------------------------------------------------------- */

do $migration$
begin

  if to_regprocedure(
    'public.cing_wallet_apply_mutation_private('
    || 'text,text,bigint,text,text,text,text,text,text,text,jsonb)'
  ) is null
  then
    raise exception
      'CING_WALLET_PRIVATE_MUTATION_AUTHORITY_MISSING';
  end if;

end;
$migration$;


commit;
