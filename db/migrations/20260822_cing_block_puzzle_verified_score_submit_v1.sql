begin;

-- ==========================================================
-- CING BLOCK PUZZLE
-- VERIFIED SCORE SUBMIT AUTHORITY V1
-- ==========================================================

/*
 * Block Puzzle must never use client-supplied score authority.
 *
 * Server deterministic replay derives:
 * - verified score
 * - replay fingerprint
 * - move count
 * - best combo
 * - total lines cleared
 *
 * PostgreSQL atomically binds that verified result to exactly
 * one authorized gameplay session.
 */


/* ----------------------------------------------------------
 * 1. Fail closed if legacy Block Puzzle score rows somehow
 *    already exist before session binding is introduced.
 * ---------------------------------------------------------- */

do $$
begin
  if exists (
    select 1
    from public.game_scores
    where game_key = 'cing-block-puzzle'
  ) then
    raise exception
      'BLOCK_PUZZLE_LEGACY_SCORE_ROWS_EXIST';
  end if;
end;
$$;


/* ----------------------------------------------------------
 * 2. Durable gameplay-session binding on shared game_scores.
 * ---------------------------------------------------------- */

alter table public.game_scores
  add column if not exists block_puzzle_session_id uuid;


/*
 * If a column with this name existed unexpectedly with another
 * type, do not continue silently.
 */
do $$
declare
  v_data_type text;
  v_udt_name text;
begin
  select
    data_type,
    udt_name
  into
    v_data_type,
    v_udt_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'game_scores'
    and column_name = 'block_puzzle_session_id';

  if
    v_data_type <> 'uuid'
    or v_udt_name <> 'uuid'
  then
    raise exception
      'BLOCK_PUZZLE_GAME_SCORE_SESSION_ID_TYPE_INVALID';
  end if;
end;
$$;


/*
 * Every non-null session reference must point to a real
 * Block Puzzle session.
 */
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'game_scores_block_puzzle_session_fk'
      and conrelid =
        'public.game_scores'::regclass
  ) then
    alter table public.game_scores
      add constraint
        game_scores_block_puzzle_session_fk
      foreign key (block_puzzle_session_id)
      references
        public.cing_block_puzzle_sessions(id)
      on update restrict
      on delete restrict;
  end if;
end;
$$;


/*
 * Block Puzzle scores cannot exist without an authorized
 * gameplay session.
 *
 * Other existing games remain completely unaffected because
 * their session_id remains NULL.
 */
alter table public.game_scores
  drop constraint if exists
    game_scores_block_puzzle_session_required_ck;

alter table public.game_scores
  add constraint
    game_scores_block_puzzle_session_required_ck
  check (
    (
      game_key = 'cing-block-puzzle'
      and block_puzzle_session_id is not null
    )
    or
    (
      game_key <> 'cing-block-puzzle'
      and block_puzzle_session_id is null
    )
  );


/*
 * DB-level exactly-once invariant.
 *
 * One authorized Block Puzzle session can produce at most
 * one persisted score.
 */
create unique index if not exists
  game_scores_block_puzzle_session_uq
on public.game_scores(block_puzzle_session_id)
where
  game_key = 'cing-block-puzzle'
  and block_puzzle_session_id is not null;


/* ----------------------------------------------------------
 * 3. Remove unnecessary client mutation privileges.
 *
 * Existing source audit proves frontend does not directly
 * mutate game_scores.
 *
 * SELECT is intentionally preserved for compatibility.
 * RLS remains enabled.
 * ---------------------------------------------------------- */

revoke insert, update, delete, truncate, references, trigger
on table public.game_scores
from anon;

revoke insert, update, delete, truncate, references, trigger
on table public.game_scores
from authenticated;


/* ----------------------------------------------------------
 * 4. Atomic verified submission authority.
 * ---------------------------------------------------------- */

create or replace function
public.cing_block_puzzle_submit_session_atomic(
  p_session_id uuid,
  p_user_id text,
  p_verified_score integer,
  p_replay_fingerprint text,
  p_move_count integer,
  p_best_combo integer,
  p_total_lines_cleared integer
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

  v_score
    public.game_scores%rowtype;

  v_now timestamptz :=
    clock_timestamp();

  v_player_name text;
  v_avatar text;
begin
  /* -----------------------
   * Input contract.
   * ----------------------- */

  if p_session_id is null then
    raise exception
      'BLOCK_PUZZLE_SESSION_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if
    p_user_id is null
    or btrim(p_user_id) = ''
  then
    raise exception
      'BLOCK_PUZZLE_USER_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if
    p_verified_score is null
    or p_verified_score < 0
  then
    raise exception
      'BLOCK_PUZZLE_VERIFIED_SCORE_INVALID'
      using errcode = '22023';
  end if;

  if
    p_replay_fingerprint is null
    or p_replay_fingerprint
      !~ '^[0-9a-f]{64}$'
  then
    raise exception
      'BLOCK_PUZZLE_REPLAY_FINGERPRINT_INVALID'
      using errcode = '22023';
  end if;

  if
    p_move_count is null
    or p_move_count <= 0
  then
    raise exception
      'BLOCK_PUZZLE_MOVE_COUNT_INVALID'
      using errcode = '22023';
  end if;

  if
    p_best_combo is null
    or p_best_combo < 0
  then
    raise exception
      'BLOCK_PUZZLE_BEST_COMBO_INVALID'
      using errcode = '22023';
  end if;

  if
    p_total_lines_cleared is null
    or p_total_lines_cleared < 0
  then
    raise exception
      'BLOCK_PUZZLE_LINES_CLEARED_INVALID'
      using errcode = '22023';
  end if;


  /* -----------------------
   * Session authority lock.
   * ----------------------- */

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


  /* -----------------------
   * Ownership authority.
   * ----------------------- */

  if v_session.user_id <> p_user_id then
    raise exception
      'BLOCK_PUZZLE_SESSION_OWNERSHIP_MISMATCH'
      using errcode = '42501';
  end if;

  if
    v_session.game_key <>
      'cing-block-puzzle'
  then
    raise exception
      'BLOCK_PUZZLE_SESSION_GAME_KEY_INVALID'
      using errcode = '55000';
  end if;

  if
    v_session.engine_version <> 1
    or v_session.rules_version <> 1
    or v_session.score_version <> 1
    or v_session.replay_version <> 1
  then
    raise exception
      'BLOCK_PUZZLE_SESSION_VERSION_INVALID'
      using errcode = '55000';
  end if;


  /* ------------------------------------------------------
   * Idempotent retry after an already successful submit.
   * ------------------------------------------------------ */

  if v_session.status = 'submitted' then
    if
      v_session.replay_fingerprint <>
        p_replay_fingerprint
      or v_session.verified_score <>
        p_verified_score
      or v_session.move_count <>
        p_move_count
    then
      raise exception
        'BLOCK_PUZZLE_SUBMIT_REPLAY_CONFLICT'
        using errcode = '40001';
    end if;

    select *
    into v_score
    from public.game_scores
    where game_key =
        'cing-block-puzzle'
      and block_puzzle_session_id =
        p_session_id;

    if not found then
      raise exception
        'BLOCK_PUZZLE_SUBMITTED_SCORE_MISSING'
        using errcode = '55000';
    end if;

    return jsonb_build_object(
      'session_id',
      v_session.id,

      'score_id',
      v_score.id,

      'verified_score',
      v_session.verified_score,

      'replay_fingerprint',
      v_session.replay_fingerprint,

      'move_count',
      v_session.move_count,

      'submitted_at',
      v_session.submitted_at,

      'idempotent',
      true
    );
  end if;


  /* -----------------------
   * Terminal lifecycle.
   * ----------------------- */

  if v_session.status = 'expired' then
    raise exception
      'BLOCK_PUZZLE_SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;

  if v_session.status <> 'active' then
    raise exception
      'BLOCK_PUZZLE_SESSION_STATUS_INVALID'
      using errcode = '55000';
  end if;

  if v_now >= v_session.expires_at then
    raise exception
      'BLOCK_PUZZLE_SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;


  /* -----------------------
   * Current profile snapshot.
   * ----------------------- */

  select *
  into v_player
  from public.players
  where user_id = p_user_id;

  if not found then
    raise exception
      'PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  v_player_name :=
    coalesce(
      nullif(
        btrim(
          to_jsonb(v_player)
            ->> 'display_name'
        ),
        ''
      ),

      nullif(
        btrim(
          to_jsonb(v_player)
            ->> 'zalo_name'
        ),
        ''
      ),

      'Cing iu'
    );

  v_avatar :=
    coalesce(
      nullif(
        btrim(
          to_jsonb(v_player)
            ->> 'avatar'
        ),
        ''
      ),
      ''
    );


  /* ------------------------------------------------------
   * Persist server-verified score.
   *
   * game_scores.id is GENERATED ALWAYS AS IDENTITY,
   * therefore id is intentionally omitted.
   * ------------------------------------------------------ */

  insert into public.game_scores (
    user_id,
    player_name,
    avatar,
    game_key,
    score,
    metadata,
    created_at,
    played_at,
    block_puzzle_session_id
  )
  values (
    p_user_id,
    v_player_name,
    v_avatar,
    'cing-block-puzzle',
    p_verified_score,

    jsonb_build_object(
      'authority',
      'server_replay_v1',

      'session_id',
      p_session_id,

      'replay_fingerprint',
      p_replay_fingerprint,

      'move_count',
      p_move_count,

      'best_combo',
      p_best_combo,

      'total_lines_cleared',
      p_total_lines_cleared,

      'engine_version',
      v_session.engine_version,

      'rules_version',
      v_session.rules_version,

      'score_version',
      v_session.score_version,

      'replay_version',
      v_session.replay_version
    ),

    v_now,
    v_now,
    p_session_id
  )
  returning *
  into v_score;


  /* ------------------------------------------------------
   * Finalize gameplay session in the SAME transaction.
   * ------------------------------------------------------ */

  update public.cing_block_puzzle_sessions
  set
    status =
      'submitted',

    submitted_at =
      v_now,

    verified_score =
      p_verified_score,

    replay_fingerprint =
      p_replay_fingerprint,

    move_count =
      p_move_count
  where id =
    p_session_id
  returning *
  into v_session;


  if
    v_session.status <> 'submitted'
    or v_session.verified_score <>
      p_verified_score
    or v_session.replay_fingerprint <>
      p_replay_fingerprint
    or v_session.move_count <>
      p_move_count
  then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_INVARIANT_FAILED'
      using errcode = '55000';
  end if;


  return jsonb_build_object(
    'session_id',
    v_session.id,

    'score_id',
    v_score.id,

    'verified_score',
    v_session.verified_score,

    'replay_fingerprint',
    v_session.replay_fingerprint,

    'move_count',
    v_session.move_count,

    'submitted_at',
    v_session.submitted_at,

    'idempotent',
    false
  );
end;
$function$;


/* ----------------------------------------------------------
 * 5. RPC authority is backend-only.
 * ---------------------------------------------------------- */

revoke all
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
from public;

revoke all
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
from anon;

revoke all
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
from authenticated;

revoke all
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
from service_role;

grant execute
on function
public.cing_block_puzzle_submit_session_atomic(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer
)
to service_role;

commit;
