/*
 * Cing Block Puzzle
 * Continue iPOS durable delivery V1
 *
 * Goals:
 * - existing purchases are never replayed automatically
 * - new purchases become durable iPOS MINUS jobs
 * - local point balance remains authoritative while delivery is pending
 * - external CRM point snapshots serialize on players row
 * - insufficient balance exposes authoritative required/current points
 */

alter table
  public.cing_block_puzzle_continue_purchases
add column if not exists
  ipos_sync_status text;

alter table
  public.cing_block_puzzle_continue_purchases
add column if not exists
  ipos_retry_count integer
  not null
  default 0;

alter table
  public.cing_block_puzzle_continue_purchases
add column if not exists
  ipos_next_retry_at timestamptz
  default now();

alter table
  public.cing_block_puzzle_continue_purchases
add column if not exists
  ipos_locked_until timestamptz;

alter table
  public.cing_block_puzzle_continue_purchases
add column if not exists
  ipos_synced_at timestamptz;

alter table
  public.cing_block_puzzle_continue_purchases
add column if not exists
  ipos_first_attempt_at timestamptz;

alter table
  public.cing_block_puzzle_continue_purchases
add column if not exists
  ipos_last_error text;

alter table
  public.cing_block_puzzle_continue_purchases
add column if not exists
  updated_at timestamptz
  not null
  default now();


/*
 * Existing records pre-date B4 and MUST NOT be replayed blindly.
 * New records receive pending after this migration.
 */
update
  public.cing_block_puzzle_continue_purchases
set
  ipos_sync_status =
    coalesce(
      ipos_sync_status,
      'legacy_synced'
    ),
  ipos_synced_at =
    case
      when ipos_sync_status is null
      then coalesce(
        ipos_synced_at,
        created_at
      )
      else ipos_synced_at
    end,
  updated_at = now()
where ipos_sync_status is null;

alter table
  public.cing_block_puzzle_continue_purchases
alter column
  ipos_sync_status
set default 'pending';

alter table
  public.cing_block_puzzle_continue_purchases
alter column
  ipos_sync_status
set not null;

alter table
  public.cing_block_puzzle_continue_purchases
drop constraint if exists
  cing_block_puzzle_continue_purchases_ipos_status_ck;

alter table
  public.cing_block_puzzle_continue_purchases
add constraint
  cing_block_puzzle_continue_purchases_ipos_status_ck
check (
  ipos_sync_status in (
    'legacy_synced',
    'pending',
    'processing',
    'synced',
    'failed'
  )
);

alter table
  public.cing_block_puzzle_continue_purchases
drop constraint if exists
  cing_block_puzzle_continue_purchases_ipos_retry_ck;

alter table
  public.cing_block_puzzle_continue_purchases
add constraint
  cing_block_puzzle_continue_purchases_ipos_retry_ck
check (
  ipos_retry_count >= 0
);

create index if not exists
  cing_block_puzzle_continue_purchases_ipos_pending_idx
on public.cing_block_puzzle_continue_purchases (
  ipos_next_retry_at,
  created_at
)
where ipos_sync_status = 'pending';


/*
 * Existing purchase authority is preserved byte-for-byte except
 * insufficient-point DETAIL.
 */

create or replace function
public.cing_block_puzzle_purchase_continue_atomic(
  p_purchase_id uuid,
  p_request_id uuid,
  p_session_id uuid,
  p_user_id text,
  p_expected_continue_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session
    public.cing_block_puzzle_sessions%rowtype;

  v_player
    public.players%rowtype;

  v_existing
    public.cing_block_puzzle_continue_purchases%rowtype;

  v_purchase
    public.cing_block_puzzle_continue_purchases%rowtype;

  v_now timestamptz :=
    clock_timestamp();

  v_continue_index integer;
  v_points_cost integer;

  v_balance_numeric numeric;
  v_balance_before integer;
  v_balance_after integer;
begin
  /* -----------------------
   * Input contract.
   * ----------------------- */

  if p_purchase_id is null then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_PURCHASE_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_session_id is null then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_SESSION_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if
    p_user_id is null
    or btrim(p_user_id) = ''
  then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_USER_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if
    p_expected_continue_index is null
    or p_expected_continue_index < 1
    or p_expected_continue_index > 3
  then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_INDEX_INVALID'
      using errcode = '22023';
  end if;


  /* ------------------------------------------------------
   * Session row is the primary serialization boundary.
   *
   * Concurrent purchases for the same gameplay session
   * cannot consume two ordinal slots simultaneously.
   * ------------------------------------------------------ */

  select *
  into v_session
  from public.cing_block_puzzle_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception
      'BLOCK_PUZZLE_SESSION_NOT_FOUND'
      using errcode = 'P0002';
  end if;


  /* ------------------------------------------------------
   * Idempotent retry after session lock.
   *
   * Same user + request_id returns the exact committed
   * purchase and MUST NOT debit points twice.
   * ------------------------------------------------------ */

  select *
  into v_existing
  from public.cing_block_puzzle_continue_purchases
  where user_id = p_user_id
    and request_id = p_request_id;

  if found then
    if
      v_existing.session_id <>
        p_session_id
      or
      v_existing.continue_index <>
        p_expected_continue_index
    then
      raise exception
        'BLOCK_PUZZLE_CONTINUE_REQUEST_CONFLICT'
        using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'purchase_id',
      v_existing.id,

      'session_id',
      v_existing.session_id,

      'continue_index',
      v_existing.continue_index,

      'points_cost',
      v_existing.points_cost,

      'balance_before',
      v_existing.balance_before,

      'balance_after',
      v_existing.balance_after,

      'continue_count',
      v_existing.continue_index,

      'created_at',
      v_existing.created_at,

      'idempotent',
      true
    );
  end if;


  /* -----------------------
   * Session authority.
   * ----------------------- */

  if v_session.user_id <> p_user_id then
    raise exception
      'BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH'
      using errcode = '42501';
  end if;

  if v_session.game_key <>
      'cing-block-puzzle'
  then
    raise exception
      'BLOCK_PUZZLE_SESSION_GAME_KEY_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Continue is a Replay V3 capability only.
   * Legacy V1/V2 sessions remain submit/recovery compatible,
   * but cannot purchase continue.
   */
  if not (
    v_session.engine_version = 2
    and v_session.rules_version = 2
    and v_session.score_version = 2
    and v_session.replay_version = 3
  ) then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_REQUIRES_REPLAY_V3'
      using errcode = 'P0001';
  end if;

  if v_session.status = 'expired' then
    raise exception
      'BLOCK_PUZZLE_SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_session.status <> 'active' then
    raise exception
      'BLOCK_PUZZLE_SESSION_STATUS_INVALID'
      using errcode = 'P0001';
  end if;

  if v_now >= v_session.expires_at then
    raise exception
      'BLOCK_PUZZLE_SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;


  /* -----------------------
   * Server-owned ordinal.
   * ----------------------- */

  v_continue_index :=
    v_session.continue_count + 1;

  if v_continue_index > 3 then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;

  if
    p_expected_continue_index <>
      v_continue_index
  then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_INDEX_CONFLICT'
      using errcode = 'P0001';
  end if;


  /* -----------------------
   * Server-owned price.
   * ----------------------- */

  v_points_cost :=
    case v_continue_index
      when 1 then 5
      when 2 then 10
      when 3 then 20
      else null
    end;

  if v_points_cost is null then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_COST_INVARIANT'
      using errcode = '55000';
  end if;


  /* ------------------------------------------------------
   * Player row is the point-balance serialization boundary.
   * ------------------------------------------------------ */

  select *
  into v_player
  from public.players
  where user_id = p_user_id
  for update;

  if not found then
    raise exception
      'PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  v_balance_numeric :=
    coalesce(
      v_player.total_points,
      0
    );

  /*
   * Existing point_transactions balance columns are integer.
   * Fail closed rather than silently rounding a numeric
   * loyalty balance.
   */
  if
    v_balance_numeric <> trunc(
      v_balance_numeric
    )
    or v_balance_numeric < 0
    or v_balance_numeric >
      2147483647
  then
    raise exception
      'BLOCK_PUZZLE_POINT_BALANCE_DOMAIN_INVALID'
      using errcode = '55000';
  end if;

  v_balance_before :=
    v_balance_numeric::integer;

  if
    v_balance_before <
      v_points_cost
  then
    raise exception
      'BLOCK_PUZZLE_INSUFFICIENT_POINTS'
      using
        errcode = 'P0001',
        detail =
          jsonb_build_object(
            'required_points',
            v_points_cost,
            'current_points',
            v_balance_before
          )::text;
  end if;

  v_balance_after :=
    v_balance_before -
    v_points_cost;


  /* ------------------------------------------------------
   * One PostgreSQL transaction:
   *
   * point balance
   * + continue purchase ledger
   * + generic point ledger projection
   * + session continue state
   * ------------------------------------------------------ */

  update public.players
  set total_points =
    v_balance_after
  where user_id =
    p_user_id;

  insert into
    public.cing_block_puzzle_continue_purchases (
      id,
      request_id,
      session_id,
      user_id,
      continue_index,
      points_cost,
      balance_before,
      balance_after,
      created_at
    )
  values (
    p_purchase_id,
    p_request_id,
    p_session_id,
    p_user_id,
    v_continue_index,
    v_points_cost,
    v_balance_before,
    v_balance_after,
    v_now
  )
  returning *
  into v_purchase;

  insert into
    public.point_transactions (
      user_id,
      order_id,
      transaction_type,
      points,
      balance_before,
      balance_after,
      reason,
      metadata,
      created_at
    )
  values (
    p_user_id,
    null,
    'deduct',
    -v_points_cost,
    v_balance_before,
    v_balance_after,
    format(
      'Mua mạng Cing Block Puzzle #%s',
      v_continue_index
    ),
    jsonb_build_object(
      'source',
      'cing_block_puzzle_continue',

      'game_key',
      'cing-block-puzzle',

      'session_id',
      p_session_id,

      'purchase_id',
      p_purchase_id,

      'request_id',
      p_request_id,

      'continue_index',
      v_continue_index
    ),
    v_now
  );

  update
    public.cing_block_puzzle_sessions
  set continue_count =
    v_continue_index
  where id =
    p_session_id
  returning *
  into v_session;

  if
    v_session.continue_count <>
      v_continue_index
  then
    raise exception
      'BLOCK_PUZZLE_CONTINUE_SESSION_INVARIANT'
      using errcode = '55000';
  end if;


  return jsonb_build_object(
    'purchase_id',
    v_purchase.id,

    'session_id',
    v_purchase.session_id,

    'continue_index',
    v_purchase.continue_index,

    'points_cost',
    v_purchase.points_cost,

    'balance_before',
    v_purchase.balance_before,

    'balance_after',
    v_purchase.balance_after,

    'continue_count',
    v_session.continue_count,

    'created_at',
    v_purchase.created_at,

    'idempotent',
    false
  );
end;
$function$;


/*
 * External CRM/iPOS snapshot authority.
 *
 * players FOR UPDATE is the common serialization boundary with
 * continue purchase.
 *
 * If Continue MINUS is not yet mirrored to iPOS, stale external
 * balance is not allowed to overwrite local balance.
 */

create or replace function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  p_user_id text,
  p_external_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_player public.players%rowtype;
  v_protected boolean := false;
  v_balance_before integer;
begin
  if
    p_user_id is null
    or btrim(p_user_id) = ''
  then
    raise exception
      'LOYALTY_EXTERNAL_SNAPSHOT_USER_REQUIRED'
      using errcode = '22023';
  end if;

  if
    p_external_points is null
    or p_external_points < 0
  then
    raise exception
      'LOYALTY_EXTERNAL_SNAPSHOT_POINTS_INVALID'
      using errcode = '22023';
  end if;

  select *
  into v_player
  from public.players
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.players (
      user_id,
      total_points
    )
    values (
      p_user_id,
      p_external_points
    )
    returning *
    into v_player;

    return jsonb_build_object(
      'applied', true,
      'protected', false,
      'balance_before', null,
      'total_points', p_external_points
    );
  end if;

  if
    coalesce(
      v_player.total_points,
      0
    ) <>
    trunc(
      coalesce(
        v_player.total_points,
        0
      )
    )
  then
    raise exception
      'LOYALTY_LOCAL_POINT_BALANCE_INVALID'
      using errcode = '55000';
  end if;

  v_balance_before :=
    coalesce(
      v_player.total_points,
      0
    )::integer;

  select exists (
    select 1
    from
      public.cing_block_puzzle_continue_purchases p
    where
      p.user_id = p_user_id
      and p.ipos_sync_status in (
        'pending',
        'processing',
        'failed'
      )
  )
  into v_protected;

  if v_protected then
    return jsonb_build_object(
      'applied', false,
      'protected', true,
      'balance_before', v_balance_before,
      'total_points', v_balance_before
    );
  end if;

  update public.players
  set total_points =
    p_external_points
  where user_id =
    p_user_id;

  return jsonb_build_object(
    'applied', true,
    'protected', false,
    'balance_before', v_balance_before,
    'total_points', p_external_points
  );
end;
$function$;


/* ACL */

revoke all
on function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  text,
  integer
)
from public;

revoke all
on function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  text,
  integer
)
from anon;

revoke all
on function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  text,
  integer
)
from authenticated;

grant execute
on function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  text,
  integer
)
to service_role;


/*
 * Core ledger stays immutable to backend.
 * Worker may mutate delivery metadata only.
 */
grant select
on table
  public.cing_block_puzzle_continue_purchases
to service_role;

grant update (
  ipos_sync_status,
  ipos_retry_count,
  ipos_next_retry_at,
  ipos_locked_until,
  ipos_synced_at,
  ipos_first_attempt_at,
  ipos_last_error,
  updated_at
)
on table
  public.cing_block_puzzle_continue_purchases
to service_role;
