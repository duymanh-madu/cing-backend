begin;

-- ==========================================================
-- CING BLOCK PUZZLE
-- CONTINUE PURCHASE AUTHORITY V1
--
-- Cost:
--   continue #1 = 5 points
--   continue #2 = 10 points
--   continue #3 = 20 points
--
-- PostgreSQL owns:
--   session serialization
--   player balance serialization
--   continue ordinal
--   cost
--   point debit
--   durable purchase ledger
--   loyalty point ledger projection
-- ==========================================================


/* ----------------------------------------------------------
 * 1. Authoritative session continue state.
 * ---------------------------------------------------------- */

alter table
  public.cing_block_puzzle_sessions
add column if not exists
  continue_count integer
  not null
  default 0;

alter table
  public.cing_block_puzzle_sessions
drop constraint if exists
  cing_block_puzzle_sessions_continue_count_ck;

alter table
  public.cing_block_puzzle_sessions
add constraint
  cing_block_puzzle_sessions_continue_count_ck
check (
  continue_count >= 0
  and continue_count <= 3
);


/* ----------------------------------------------------------
 * 2. Durable continue-purchase ledger.
 * ---------------------------------------------------------- */

create table if not exists
  public.cing_block_puzzle_continue_purchases (
    id uuid primary key,

    request_id uuid not null,

    session_id uuid not null
      references
        public.cing_block_puzzle_sessions(id)
      on update restrict
      on delete restrict,

    user_id text not null,

    continue_index integer not null,

    points_cost integer not null,

    balance_before integer not null,

    balance_after integer not null,

    created_at timestamptz
      not null
      default now(),

    constraint
      cing_block_puzzle_continue_purchases_user_ck
    check (
      btrim(user_id) <> ''
    ),

    constraint
      cing_block_puzzle_continue_purchases_index_ck
    check (
      continue_index between 1 and 3
    ),

    constraint
      cing_block_puzzle_continue_purchases_cost_ck
    check (
      (
        continue_index = 1
        and points_cost = 5
      )
      or
      (
        continue_index = 2
        and points_cost = 10
      )
      or
      (
        continue_index = 3
        and points_cost = 20
      )
    ),

    constraint
      cing_block_puzzle_continue_purchases_balance_ck
    check (
      balance_before >= 0
      and balance_after >= 0
      and balance_after =
        balance_before - points_cost
    ),

    constraint
      cing_block_puzzle_continue_purchases_user_request_uq
    unique (
      user_id,
      request_id
    ),

    constraint
      cing_block_puzzle_continue_purchases_session_index_uq
    unique (
      session_id,
      continue_index
    )
  );


create index if not exists
  cing_block_puzzle_continue_purchases_session_created_idx
on public.cing_block_puzzle_continue_purchases (
  session_id,
  created_at desc
);

create index if not exists
  cing_block_puzzle_continue_purchases_user_created_idx
on public.cing_block_puzzle_continue_purchases (
  user_id,
  created_at desc
);


/* ----------------------------------------------------------
 * 3. Table ACL.
 *
 * Writes belong exclusively to SECURITY DEFINER authority.
 * Backend repository may read for diagnostics/recovery.
 * ---------------------------------------------------------- */

revoke all
on table
  public.cing_block_puzzle_continue_purchases
from public;

revoke all
on table
  public.cing_block_puzzle_continue_purchases
from anon;

revoke all
on table
  public.cing_block_puzzle_continue_purchases
from authenticated;

revoke all
on table
  public.cing_block_puzzle_continue_purchases
from service_role;

grant select
on table
  public.cing_block_puzzle_continue_purchases
to service_role;


/* ----------------------------------------------------------
 * 4. Atomic continue purchase authority.
 * ---------------------------------------------------------- */

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
      using errcode = 'P0001';
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


/* ----------------------------------------------------------
 * 5. RPC ACL.
 * ---------------------------------------------------------- */

revoke all
on function
public.cing_block_puzzle_purchase_continue_atomic(
  uuid,
  uuid,
  uuid,
  text,
  integer
)
from public;

revoke all
on function
public.cing_block_puzzle_purchase_continue_atomic(
  uuid,
  uuid,
  uuid,
  text,
  integer
)
from anon;

revoke all
on function
public.cing_block_puzzle_purchase_continue_atomic(
  uuid,
  uuid,
  uuid,
  text,
  integer
)
from authenticated;

grant execute
on function
public.cing_block_puzzle_purchase_continue_atomic(
  uuid,
  uuid,
  uuid,
  text,
  integer
)
to service_role;

commit;
