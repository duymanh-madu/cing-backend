begin;

create table if not exists public.cing_block_puzzle_sessions (
  id uuid primary key,
  request_id uuid not null,

  user_id text not null,
  game_key text not null,

  seed bigint not null,

  engine_version integer not null,
  rules_version integer not null,
  score_version integer not null,
  replay_version integer not null,

  play_cost integer not null,

  status text not null,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  submitted_at timestamptz,
  verified_score bigint,
  replay_fingerprint text,
  move_count integer,

  constraint cing_block_puzzle_sessions_game_key_ck
    check (game_key = 'cing-block-puzzle'),

  constraint cing_block_puzzle_sessions_seed_ck
    check (seed between 1 and 4294967295),

  constraint cing_block_puzzle_sessions_versions_ck
    check (
      engine_version = 1
      and rules_version = 1
      and score_version = 1
      and replay_version = 1
    ),

  constraint cing_block_puzzle_sessions_play_cost_ck
    check (play_cost = 1),

  constraint cing_block_puzzle_sessions_status_ck
    check (status in ('active', 'submitted', 'expired')),

  constraint cing_block_puzzle_sessions_lifecycle_ck
    check (
      (
        status = 'active'
        and submitted_at is null
        and verified_score is null
        and replay_fingerprint is null
        and move_count is null
      )
      or
      (
        status = 'submitted'
        and submitted_at is not null
        and verified_score is not null
        and verified_score >= 0
        and replay_fingerprint is not null
        and length(replay_fingerprint) > 0
        and move_count is not null
        and move_count >= 0
      )
      or
      (
        status = 'expired'
        and submitted_at is null
        and verified_score is null
        and replay_fingerprint is null
        and move_count is null
      )
    ),

  constraint cing_block_puzzle_sessions_expiry_ck
    check (expires_at > created_at),

  constraint cing_block_puzzle_sessions_user_request_uq
    unique (user_id, request_id)
);

create index if not exists
  cing_block_puzzle_sessions_user_created_idx
on public.cing_block_puzzle_sessions (
  user_id,
  created_at desc
);

create index if not exists
  cing_block_puzzle_sessions_active_expiry_idx
on public.cing_block_puzzle_sessions (
  expires_at
)
where status = 'active';


/*
 * Backend-owned durable authority.
 * Direct table access is not part of the client contract.
 */
revoke all
on table public.cing_block_puzzle_sessions
from public;

revoke all
on table public.cing_block_puzzle_sessions
from anon;

revoke all
on table public.cing_block_puzzle_sessions
from authenticated;

grant select, insert, update
on table public.cing_block_puzzle_sessions
to service_role;


create or replace function public.cing_block_puzzle_start_session_atomic(
  p_session_id uuid,
  p_request_id uuid,
  p_user_id text,
  p_seed bigint,
  p_engine_version integer,
  p_rules_version integer,
  p_score_version integer,
  p_replay_version integer,
  p_ttl_seconds integer
)
returns public.cing_block_puzzle_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.cing_block_puzzle_sessions%rowtype;
  v_player public.players%rowtype;
  v_config jsonb;
  v_game_policy jsonb;
  v_economy_type text;
  v_now timestamptz := clock_timestamp();
  v_session public.cing_block_puzzle_sessions%rowtype;
begin
  if p_session_id is null then
    raise exception 'BLOCK_PUZZLE_SESSION_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'BLOCK_PUZZLE_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_user_id is null or btrim(p_user_id) = '' then
    raise exception 'BLOCK_PUZZLE_USER_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_seed is null or p_seed < 1 or p_seed > 4294967295 then
    raise exception 'BLOCK_PUZZLE_INVALID_SEED'
      using errcode = '22023';
  end if;

  if
    p_engine_version <> 1
    or p_rules_version <> 1
    or p_score_version <> 1
    or p_replay_version <> 1
  then
    raise exception 'BLOCK_PUZZLE_UNSUPPORTED_VERSION'
      using errcode = '22023';
  end if;

  if p_ttl_seconds is null or p_ttl_seconds < 300 or p_ttl_seconds > 86400 then
    raise exception 'BLOCK_PUZZLE_INVALID_TTL'
      using errcode = '22023';
  end if;

  /*
   * Idempotent retry:
   * same authenticated user + same request_id returns
   * the original session and MUST NOT consume another play.
   */
  select *
    into v_existing
  from public.cing_block_puzzle_sessions
  where user_id = p_user_id
    and request_id = p_request_id;

  if found then
    return v_existing;
  end if;

  /*
   * Economy configuration remains DB-driven.
   * No game-specific paid/free decision is trusted from client.
   */
  select game_economy_config
    into v_config
  from public.app_configs
  where id = 1;

  if v_config is null then
    raise exception 'GAME_ECONOMY_CONFIG_UNAVAILABLE'
      using errcode = '55000';
  end if;

  v_game_policy :=
    v_config #> array['games', 'cing-block-puzzle'];

  if v_game_policy is null then
    raise exception 'GAME_POLICY_NOT_CONFIGURED'
      using errcode = '55000';
  end if;

  v_economy_type :=
    btrim(coalesce(v_game_policy ->> 'economy_type', ''));

  if v_economy_type <> 'paid_offline' then
    raise exception 'BLOCK_PUZZLE_REQUIRES_PAID_OFFLINE'
      using errcode = '55000';
  end if;

  /*
   * Row lock serializes concurrent starts for this player.
   */
  select *
    into v_player
  from public.players
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Critical concurrent-idempotency fence.
   *
   * The player row lock serializes session starts for this user.
   * A concurrent retry may have passed the optimistic precheck
   * before waiting on this lock. Re-check after the lock and
   * BEFORE consuming a play.
   */
  select *
    into v_existing
  from public.cing_block_puzzle_sessions
  where user_id = p_user_id
    and request_id = p_request_id;

  if found then
    return v_existing;
  end if;

  if coalesce(v_player.game_plays, 0) < 1 then
    raise exception 'NO_GAME_PLAYS'
      using errcode = 'P0001';
  end if;

  update public.players
  set game_plays = coalesce(game_plays, 0) - 1
  where user_id = p_user_id;

  insert into public.cing_block_puzzle_sessions (
    id,
    request_id,
    user_id,
    game_key,
    seed,
    engine_version,
    rules_version,
    score_version,
    replay_version,
    play_cost,
    status,
    created_at,
    expires_at
  )
  values (
    p_session_id,
    p_request_id,
    p_user_id,
    'cing-block-puzzle',
    p_seed,
    1,
    1,
    1,
    1,
    1,
    'active',
    v_now,
    v_now + make_interval(secs => p_ttl_seconds)
  )
  returning *
    into v_session;


  return v_session;
end;
$$;


/*
 * Private backend authority only.
 */
revoke all
on function public.cing_block_puzzle_start_session_atomic(
  uuid,
  uuid,
  text,
  bigint,
  integer,
  integer,
  integer,
  integer,
  integer
)
from public;

revoke all
on function public.cing_block_puzzle_start_session_atomic(
  uuid,
  uuid,
  text,
  bigint,
  integer,
  integer,
  integer,
  integer,
  integer
)
from anon;

revoke all
on function public.cing_block_puzzle_start_session_atomic(
  uuid,
  uuid,
  text,
  bigint,
  integer,
  integer,
  integer,
  integer,
  integer
)
from authenticated;

grant execute
on function public.cing_block_puzzle_start_session_atomic(
  uuid,
  uuid,
  text,
  bigint,
  integer,
  integer,
  integer,
  integer,
  integer
)
to service_role;

commit;
