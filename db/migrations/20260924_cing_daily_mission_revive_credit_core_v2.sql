begin;

/*
 * CING GAME CENTER V2
 * DAILY MISSION REVIVE CREDIT CORE V2
 *
 * DORMANT AUTHORITY.
 *
 * V1 remains unchanged and callable.
 * Backend does not switch to V2 in this migration.
 *
 * No legacy game_plays/game_play_transactions write.
 * No Wallet or external iPOS mutation.
 *
 * History projection is a separate gated change.
 */

create function
public.complete_daily_mission_revive_v2(

  p_user_id text,

  p_mission_date date,

  p_mission_type text,

  p_revive_credits integer,

  p_points integer,

  p_mission_label text default null

)

returns table (

  applied boolean,

  mission_id uuid,

  revive_credits_awarded integer,

  points_awarded integer,

  revive_credit_balance_after integer,

  total_points_after integer

)

language plpgsql

security definer

set search_path = public

as $function$

declare

  v_user_id text;

  v_mission_type text;

  v_label text;

  v_credits integer;

  v_points integer;

  v_player
    public.players%rowtype;

  v_existing
    public.daily_missions%rowtype;

  v_mission_id uuid;

  v_points_numeric numeric;

  v_points_before integer;

  v_points_after integer;

  v_credit_result record;

  v_credit_balance integer;

  v_existing_credits integer;

begin

  v_user_id :=
    nullif(
      btrim(coalesce(p_user_id, '')),
      ''
    );

  v_mission_type :=
    nullif(
      btrim(coalesce(p_mission_type, '')),
      ''
    );

  v_label :=
    nullif(
      btrim(coalesce(p_mission_label, '')),
      ''
    );

  v_credits :=
    coalesce(p_revive_credits, 0);

  v_points :=
    coalesce(p_points, 0);

  if v_user_id is null then

    raise exception
      'DAILY_MISSION_USER_ID_REQUIRED'
      using errcode = '22023';

  end if;

  if p_mission_date is null then

    raise exception
      'DAILY_MISSION_DATE_REQUIRED'
      using errcode = '22023';

  end if;

  if v_mission_type is null then

    raise exception
      'DAILY_MISSION_TYPE_REQUIRED'
      using errcode = '22023';

  end if;

  if v_credits < 0 then

    raise exception
      'DAILY_MISSION_REVIVE_CREDITS_INVALID'
      using errcode = '22023';

  end if;

  if v_points < 0 then

    raise exception
      'DAILY_MISSION_POINTS_INVALID'
      using errcode = '22023';

  end if;

  if v_credits = 0
    and v_points = 0
  then

    raise exception
      'DAILY_MISSION_REWARD_EMPTY'
      using errcode = '22023';

  end if;

  /*
   * Same serialization boundary as V1.
   * V1 and V2 compete for the same player lock,
   * followed by the same canonical mission fence.
   */

  select p.*

  into v_player

  from public.players p

  where p.user_id = v_user_id

  for update;

  if not found then

    raise exception
      'DAILY_MISSION_PLAYER_NOT_FOUND'
      using errcode = 'P0002';

  end if;

  select m.*

  into v_existing

  from public.daily_missions m

  where m.user_id =
      v_user_id

    and m.mission_date =
      p_mission_date

    and m.mission_type =
      v_mission_type

  for update;

  v_points_numeric :=
    coalesce(
      v_player.total_points,
      0
    );

  if v_points_numeric <>
      trunc(v_points_numeric)

    or v_points_numeric < 0

    or v_points_numeric >
      2147483647

  then

    raise exception
      'DAILY_MISSION_POINT_BALANCE_DOMAIN_INVALID'
      using errcode = '55000';

  end if;

  v_points_before :=
    v_points_numeric::integer;

  /*
   * Existing completed V1 missions return without
   * granting any V2 credits or loyalty points.
   *
   * Existing completed V2 missions likewise
   * return their original reward snapshot.
   */

  if found
    and v_existing.completed
  then

    v_existing_credits :=
      case

        when
          v_existing.reward_snapshot
            ->> 'reward_currency'
            = 'revive_credit'

        then
          coalesce(
            (
              v_existing.reward_snapshot
                ->> 'revive_credits'
            )::integer,
            0
          )

        else 0

      end;

    select coalesce(
      (
        select b.balance
        from
          public.cing_revive_credit_balances b
        where b.user_id = v_user_id
      ),
      0
    )

    into v_credit_balance;

    return query

    select

      false,

      v_existing.id,

      v_existing_credits,

      coalesce(
        v_existing.points_awarded,
        0
      ),

      v_credit_balance,

      v_points_before;

    return;

  end if;

  /*
   * Validate loyalty-point overflow before
   * creating either reward.
   */

  if v_points_before >
      2147483647 - v_points
  then

    raise exception
      'DAILY_MISSION_POINT_BALANCE_OVERFLOW'
      using errcode = '22003';

  end if;

  v_points_after :=
    v_points_before + v_points;

  /*
   * The canonical Daily Mission identity must
   * exist before building the Credit reference.
   *
   * plays_awarded = 0 deliberately means that
   * this V2 mission did not grant legacy plays.
   *
   * Revive Credit reward is stored explicitly
   * in the versioned JSON snapshot.
   */

  insert into
    public.daily_missions (

      user_id,

      mission_date,

      mission_type,

      completed,

      plays_awarded,

      points_awarded,

      completed_at,

      reward_snapshot,

      reward_applied_at

    )

  values (

    v_user_id,

    p_mission_date,

    v_mission_type,

    true,

    0,

    v_points,

    clock_timestamp(),

    jsonb_build_object(

      'reward_version',
      2,

      'reward_currency',
      'revive_credit',

      'revive_credits',
      v_credits,

      'plays',
      0,

      'points',
      v_points,

      'label',
      v_label

    ),

    clock_timestamp()

  )

  on conflict (

    user_id,

    mission_date,

    mission_type

  )

  do update

  set

    completed =
      true,

    plays_awarded =
      excluded.plays_awarded,

    points_awarded =
      excluded.points_awarded,

    completed_at =
      excluded.completed_at,

    reward_snapshot =
      excluded.reward_snapshot,

    reward_applied_at =
      excluded.reward_applied_at

  returning id

  into v_mission_id;

  /*
   * The private mutation owns the Revive Credit
   * balance, transaction ledger and idempotency.
   *
   * This call shares the entire Daily Mission
   * PostgreSQL transaction.
   */

  if v_credits > 0 then

    select *

    into v_credit_result

    from
      public.cing_revive_credit_apply_private_v1(

        v_user_id,

        v_credits,

        coalesce(
          v_label,
          'Nhiệm vụ hoàn thành'
        ),

        'daily_mission_revive_v2',

        v_mission_id::text,

        null::text,

        null::uuid,

        jsonb_build_object(

          'source',
          'daily_mission',

          'reward_version',
          2,

          'reward_currency',
          'revive_credit',

          'mission_id',
          v_mission_id,

          'mission_date',
          p_mission_date,

          'mission_type',
          v_mission_type

        )

      );

    if not found
      or v_credit_result.applied
        is distinct from true
    then

      raise exception
        'DAILY_MISSION_REVIVE_GRANT_FAILED'
        using errcode = '55000';

    end if;

    v_credit_balance :=
      v_credit_result.balance_after;

  else

    select coalesce(

      (
        select b.balance

        from
          public.cing_revive_credit_balances b

        where b.user_id =
          v_user_id
      ),

      0

    )

    into v_credit_balance;

  end if;

  /*
   * Loyalty-point balance and canonical ledger
   * preserve V1's reward semantics.
   */

  update public.players p

  set total_points =
    v_points_after

  where p.user_id =
    v_user_id;

  if v_points > 0 then

    insert into
      public.point_transactions (

        user_id,

        mission_id,

        transaction_type,

        points,

        balance_before,

        balance_after,

        reason,

        metadata

      )

    values (

      v_user_id,

      v_mission_id,

      'add',

      v_points,

      v_points_before,

      v_points_after,

      coalesce(
        v_label,
        'Nhiệm vụ hoàn thành'
      ),

      jsonb_build_object(

        'source',
        'daily_mission',

        'mission_id',
        v_mission_id,

        'mission_date',
        p_mission_date,

        'mission_type',
        v_mission_type

      )

    );

  end if;

  return query

  select

    true,

    v_mission_id,

    v_credits,

    v_points,

    v_credit_balance,

    v_points_after;

end;

$function$;

/*
 * Backend-only RPC.
 *
 * HTTP callers do not execute this directly.
 */

revoke all

on function
public.complete_daily_mission_revive_v2(

  text,
  date,
  text,
  integer,
  integer,
  text

)

from public, anon, authenticated, service_role;

grant execute

on function
public.complete_daily_mission_revive_v2(

  text,
  date,
  text,
  integer,
  integer,
  text

)

to service_role;

commit;
