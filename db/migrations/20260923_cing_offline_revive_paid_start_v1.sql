begin;

/*
 * CING GAME CENTER V2
 *
 * ATOMIC PAID OFFLINE REVIVAL START V1
 *
 * Applies only to:
 *   cing-stack-tower
 *   black-pearl-rush
 *
 * Dependencies:
 *   game_play_transactions
 *   offline revival session foundation
 *   original offline revival start V1
 *
 * One PostgreSQL transaction owns:
 *   - economy policy verification
 *   - one game-play debit
 *   - one offline revival session
 *   - one authoritative play ledger entry
 *   - one legacy analytics compatibility event
 *
 * The original migration is deliberately preserved.
 *
 * This replacement keeps the existing RPC signature
 * and return contract.
 *
 * It never debits Revive Credit, Wallet or loyalty.
 */

create or replace function
  public.cing_offline_revive_start_v1(
    p_user_id text,
    p_request_id uuid,
    p_game_key text
  )
returns table (
  applied boolean,
  session_id uuid,
  game_key text,
  session_status text,
  revives_used integer,
  event_seq integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_game_key text;

  v_existing
    public.cing_offline_revive_sessions%rowtype;

  v_created
    public.cing_offline_revive_sessions%rowtype;

  v_player
    public.players%rowtype;

  v_config jsonb;
  v_policy jsonb;
  v_economy_type text;

  v_balance_before integer;
  v_balance_after integer;

  v_now timestamptz;
begin
  v_user_id :=
    nullif(
      btrim(coalesce(p_user_id, '')),
      ''
    );

  v_game_key :=
    nullif(
      btrim(coalesce(p_game_key, '')),
      ''
    );

  if v_user_id is null then
    raise exception
      'REVIVAL_USER_REQUIRED'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception
      'REVIVAL_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if v_game_key is null
     or v_game_key not in (
       'cing-stack-tower',
       'black-pearl-rush'
     )
  then
    raise exception
      'REVIVAL_GAME_NOT_SUPPORTED'
      using errcode = '22023';
  end if;

  /*
   * Fast idempotent replay.
   *
   * An existing session must have its corresponding
   * durable play-debit record.
   */

  select *
    into v_existing
  from public.cing_offline_revive_sessions s
  where s.user_id = v_user_id
    and s.request_id = p_request_id;

  if found then
    if v_existing.game_key <> v_game_key then
      raise exception
        'REVIVAL_START_REFERENCE_CONFLICT'
        using errcode = '23505';
    end if;

    perform 1
    from public.game_play_transactions t
    where t.user_id = v_user_id
      and t.game_key = v_game_key
      and t.session_id = v_existing.id
      and t.transaction_type = 'deduct'
      and t.amount = -1
      and t.reference_type = 'game_session'
      and t.reference_id = v_existing.id::text;

    if not found then
      raise exception
        'REVIVAL_START_LEDGER_MISSING'
        using errcode = '55000';
    end if;

    return query
    select
      false,
      v_existing.id,
      v_existing.game_key,
      v_existing.status,
      v_existing.revives_used,
      v_existing.event_seq,
      v_existing.expires_at;

    return;
  end if;

  /*
   * Game economy remains PostgreSQL-configured.
   *
   * Browser-provided play cost is never accepted.
   */

  select a.game_economy_config
    into v_config
  from public.app_configs a
  where a.id = 1;

  if v_config is null then
    raise exception
      'GAME_ECONOMY_CONFIG_UNAVAILABLE'
      using errcode = '55000';
  end if;

  v_policy :=
    v_config #> array[
      'games',
      v_game_key
    ];

  if v_policy is null then
    raise exception
      'GAME_POLICY_NOT_CONFIGURED'
      using errcode = '55000';
  end if;

  v_economy_type :=
    btrim(
      coalesce(
        v_policy ->> 'economy_type',
        ''
      )
    );

  if v_economy_type <> 'paid_offline' then
    raise exception
      'REVIVAL_REQUIRES_PAID_OFFLINE'
      using errcode = '55000';
  end if;

  /*
   * Serialize concurrent paid session starts
   * for the same authenticated player.
   */

  select *
    into v_player
  from public.players p
  where p.user_id = v_user_id
  for update;

  if not found then
    raise exception
      'REVIVAL_PLAYER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Critical second replay check.
   *
   * A concurrent request may have committed
   * while this transaction waited for the lock.
   */

  select *
    into v_existing
  from public.cing_offline_revive_sessions s
  where s.user_id = v_user_id
    and s.request_id = p_request_id;

  if found then
    if v_existing.game_key <> v_game_key then
      raise exception
        'REVIVAL_START_REFERENCE_CONFLICT'
        using errcode = '23505';
    end if;

    perform 1
    from public.game_play_transactions t
    where t.user_id = v_user_id
      and t.game_key = v_game_key
      and t.session_id = v_existing.id
      and t.transaction_type = 'deduct'
      and t.amount = -1
      and t.reference_type = 'game_session'
      and t.reference_id = v_existing.id::text;

    if not found then
      raise exception
        'REVIVAL_START_LEDGER_MISSING'
        using errcode = '55000';
    end if;

    return query
    select
      false,
      v_existing.id,
      v_existing.game_key,
      v_existing.status,
      v_existing.revives_used,
      v_existing.event_seq,
      v_existing.expires_at;

    return;
  end if;

  /*
   * Exactly one paid game play.
   */

  v_balance_before :=
    coalesce(
      v_player.game_plays,
      0
    );

  if v_balance_before < 1 then
    raise exception
      'NO_GAME_PLAYS'
      using errcode = 'P0001';
  end if;

  update public.players p
  set game_plays = p.game_plays - 1
  where p.user_id = v_user_id
  returning p.game_plays
    into v_balance_after;

  if v_balance_after is distinct from
     v_balance_before - 1
  then
    raise exception
      'REVIVAL_PLAY_BALANCE_INVARIANT'
      using errcode = '55000';
  end if;

  /*
   * Database-owned session identity.
   *
   * If any later write fails, the debit
   * and session creation both roll back.
   */

  v_now := clock_timestamp();

  insert into public.cing_offline_revive_sessions (
    id,
    request_id,
    user_id,
    game_key,
    status,
    revives_used,
    event_seq,
    expires_at
  )
  values (
    gen_random_uuid(),
    p_request_id,
    v_user_id,
    v_game_key,
    'active',
    0,
    0,
    v_now + interval '4 hours'
  )
  returning *
    into v_created;

  /*
   * Authoritative durable play ledger.
   */

  insert into public.game_play_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    reason,
    game_key,
    session_id,
    reference_type,
    reference_id,
    metadata,
    created_at
  )
  values (
    v_user_id,
    'deduct',
    -1,
    v_balance_before,
    v_balance_after,
    'Chơi ' || v_game_key,
    v_game_key,
    v_created.id,
    'game_session',
    v_created.id::text,
    jsonb_build_object(
      'request_id',
      p_request_id
    ),
    v_now
  );

  /*
   * Backward-compatible profile history.
   *
   * Matches the established Block Puzzle
   * plays_deducted event projection.
   */

  insert into public.analytics_events (
    user_id,
    event_name,
    event_data,
    metadata,
    created_at
  )
  values (
    v_user_id,
    'plays_deducted',
    jsonb_build_object(
      'amount',
      -1,
      'reason',
      'Chơi ' || v_game_key,
      'new_total',
      v_balance_after,
      'source',
      'game_session',
      'game_key',
      v_game_key,
      'session_id',
      v_created.id
    ),
    jsonb_build_object(
      'session_id',
      v_created.id,
      'request_id',
      p_request_id
    ),
    v_now
  );

  return query
  select
    true,
    v_created.id,
    v_created.game_key,
    v_created.status,
    v_created.revives_used,
    v_created.event_seq,
    v_created.expires_at;

end;
$$;

/*
 * Preserve the exact backend-only execution grant.
 */

revoke all
on function public.cing_offline_revive_start_v1(
  text,
  uuid,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.cing_offline_revive_start_v1(
  text,
  uuid,
  text
)
to service_role;

commit;
