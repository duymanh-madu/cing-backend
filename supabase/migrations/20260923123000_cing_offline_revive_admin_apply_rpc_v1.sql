begin;

/*
 * CING GAME CENTER V2
 *
 * Atomic Admin Daily Challenge Apply V1.
 *
 * Dependencies:
 *   - existing app_configs
 *   - existing admins
 *   - existing daily_challenges
 *   - unapplied Revival snapshot V1 migration
 *
 * This migration DOES NOT grant reward points.
 * It DOES NOT alter the legacy claim RPC.
 *
 * The backend must pass actor_admin_id from
 * the verified Admin JWT, never from req.body.
 */

/*
 * One durable request per Admin action.
 *
 * The complete submitted challenge list is
 * retained so a retry with the same UUID but
 * different content cannot silently succeed.
 */

create table
  public.cing_offline_revive_admin_applies (
    apply_request_id uuid primary key,

    actor_admin_id text not null
      check (
        length(
          btrim(actor_admin_id)
        ) > 0
      ),

    full_challenges jsonb not null
      check (
        jsonb_typeof(
          full_challenges
        ) = 'array'
      ),

    revival_challenges jsonb not null
      check (
        jsonb_typeof(
          revival_challenges
        ) = 'array'
      ),

    challenge_date date not null,

    applied_at timestamptz not null,

    result jsonb not null
  );

/*
 * The database transaction owns all
 * configuration and snapshot mutations.
 */

create function
public.cing_offline_revive_admin_apply_v1(
  p_apply_request_id uuid,
  p_actor_admin_id text,
  p_full_challenges jsonb,
  p_revival_challenges jsonb
)
returns jsonb

language plpgsql

security definer

set search_path = public

as $$
declare
  v_config public.app_configs%rowtype;

  v_existing
    public.cing_offline_revive_admin_applies%rowtype;

  v_admin_id text;

  v_applied_at timestamptz;

  v_challenge_date date;

  v_game text;

  v_entry jsonb;

  v_full_entry jsonb;

  v_enabled boolean;

  v_type text;

  v_target integer;

  v_reward integer;

  v_challenge_id uuid;

  v_completed boolean;

  v_rows jsonb := '[]'::jsonb;

  v_result jsonb;
begin

  /*
   * Validate identities before accessing
   * the configuration authority.
   */

  if p_apply_request_id is null then
    raise exception
      'REVIVAL_APPLY_REQUEST_ID_REQUIRED'
      using errcode = '22023';
  end if;

  v_admin_id :=
    nullif(
      btrim(
        coalesce(
          p_actor_admin_id,
          ''
        )
      ),
      ''
    );

  if v_admin_id is null then
    raise exception
      'REVIVAL_APPLY_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  if jsonb_typeof(
    p_full_challenges
  ) is distinct from 'array'
    or jsonb_typeof(
      p_revival_challenges
    ) is distinct from 'array'
  then
    raise exception
      'REVIVAL_APPLY_PAYLOAD_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Recheck current Admin authority in DB.
   *
   * A valid old JWT alone is insufficient
   * if the account was disabled or demoted.
   */

  perform 1
  from public.admins a
  where a.id::text = v_admin_id
    and a.active = true
    and a.role = 'super_admin'
  for share;

  if not found then
    raise exception
      'REVIVAL_APPLY_SUPER_ADMIN_REQUIRED'
      using errcode = '42501';
  end if;

  /*
   * Shared serialization boundary.
   *
   * Finalize V2 must also lock this exact
   * app_configs row before binding its
   * effective snapshot.
   */

  select c.*
  into v_config
  from public.app_configs c
  where c.id = 1
  for update;

  if not found then
    raise exception
      'REVIVAL_APPLY_CONFIG_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * Idempotency is checked under the
   * app-config serialization lock.
   */

  select a.*
  into v_existing
  from public.cing_offline_revive_admin_applies a
  where a.apply_request_id =
    p_apply_request_id;

  if found then

    if v_existing.actor_admin_id
         is distinct from v_admin_id

      or v_existing.full_challenges
         is distinct from
           p_full_challenges

      or v_existing.revival_challenges
         is distinct from
           p_revival_challenges
    then
      raise exception
        'REVIVAL_APPLY_REQUEST_CONFLICT'
        using errcode = '23505';
    end if;

    return
      v_existing.result ||
      jsonb_build_object(
        'applied', false,
        'replayed', true
      );

  end if;

  /*
   * Exactly two Revival entries:
   * one per supported offline game.
   */

  if jsonb_array_length(
    p_revival_challenges
  ) <> 2 then
    raise exception
      'REVIVAL_APPLY_EXACT_TWO_GAMES_REQUIRED'
      using errcode = '22023';
  end if;

  foreach v_game in array
    array[
      'black-pearl-rush',
      'cing-stack-tower'
    ]
  loop

    if (
      select count(*)
      from jsonb_array_elements(
        p_revival_challenges
      ) r(value)
      where r.value->>'game_key' =
        v_game
    ) <> 1 then
      raise exception
        'REVIVAL_APPLY_GAME_SET_INVALID'
        using errcode = '22023';
    end if;

  end loop;

  /*
   * No third game may appear in the
   * Revival-only compiled payload.
   */

  if exists (
    select 1
    from jsonb_array_elements(
      p_revival_challenges
    ) r(value)
    where r.value->>'game_key'
      not in (
        'black-pearl-rush',
        'cing-stack-tower'
      )
      or jsonb_typeof(r.value)
        <> 'object'
  ) then
    raise exception
      'REVIVAL_APPLY_GAME_SET_INVALID'
      using errcode = '22023';
  end if;

  /*
   * Verify that the compiled Revival
   * states actually correspond to the
   * complete Admin challenge list.
   */

  foreach v_game in array
    array[
      'black-pearl-rush',
      'cing-stack-tower'
    ]
  loop

    select r.value
    into v_entry
    from jsonb_array_elements(
      p_revival_challenges
    ) r(value)
    where r.value->>'game_key' =
      v_game;

    if not (
      v_entry ? 'enabled'
    ) or jsonb_typeof(
      v_entry->'enabled'
    ) <> 'boolean' then
      raise exception
        'REVIVAL_APPLY_ENABLED_INVALID'
        using errcode = '22023';
    end if;

    v_enabled :=
      (v_entry->>'enabled')::boolean;

    if (
      select count(*)
      from jsonb_array_elements(
        p_full_challenges
      ) f(value)
      where f.value->>'game_key' =
        v_game
    ) > 1 then
      raise exception
        'REVIVAL_APPLY_DUPLICATE_GAME'
        using errcode = '22023';
    end if;

    select f.value
    into v_full_entry
    from jsonb_array_elements(
      p_full_challenges
    ) f(value)
    where f.value->>'game_key' =
      v_game;

    if v_full_entry is null then

      if v_enabled then
        raise exception
          'REVIVAL_APPLY_COMPILED_MISMATCH'
          using errcode = '22023';
      end if;

    elsif (
      v_full_entry->'enabled'
    ) is distinct from (
      v_entry->'enabled'
    ) then

      raise exception
        'REVIVAL_APPLY_COMPILED_MISMATCH'
        using errcode = '22023';

    elsif v_enabled and (

      v_full_entry->>'challenge_type'
        is distinct from
      v_entry->>'challenge_type'

      or v_full_entry->>'target_value'
        is distinct from
      v_entry->>'target_value'

      or v_full_entry->>'reward_points'
        is distinct from
      v_entry->>'reward_points'

    ) then

      raise exception
        'REVIVAL_APPLY_COMPILED_MISMATCH'
        using errcode = '22023';

    end if;

    if v_enabled then

      v_type :=
        v_entry->>'challenge_type';

      if v_type not in (
        'combo',
        'score'
      ) then
        raise exception
          'REVIVAL_APPLY_TYPE_INVALID'
          using errcode = '22023';
      end if;

      if (
        v_entry->>'target_value'
      ) !~ '^[0-9]{1,7}$'

        or (
          v_entry->>'reward_points'
        ) !~ '^[0-9]{1,7}$'
      then
        raise exception
          'REVIVAL_APPLY_VALUE_INVALID'
          using errcode = '22023';
      end if;

      v_target :=
        (v_entry->>'target_value')::integer;

      v_reward :=
        (v_entry->>'reward_points')::integer;

      if v_target not between
          1 and 1000000

        or v_reward not between
          1 and 1000000
      then
        raise exception
          'REVIVAL_APPLY_VALUE_INVALID'
          using errcode = '22023';
      end if;

    else

      if v_entry->'challenge_type'
           is distinct from
             'null'::jsonb

        or v_entry->'target_value'
           is distinct from
             'null'::jsonb

        or v_entry->'reward_points'
           is distinct from
             'null'::jsonb
      then
        raise exception
          'REVIVAL_APPLY_DISABLED_VALUES_INVALID'
          using errcode = '22023';
      end if;

    end if;

  end loop;

  /*
   * PostgreSQL determines the effective
   * Admin application date and time
   * after acquiring the shared lock.
   */

  v_applied_at :=
    clock_timestamp();

  v_challenge_date :=
    (
      v_applied_at
      at time zone
        'Asia/Ho_Chi_Minh'
    )::date;

  /*
   * Save the complete Admin list.
   * Chess and other legacy game entries
   * are retained as submitted.
   *
   * Other app_configs columns remain
   * untouched.
   */

  update public.app_configs
  set daily_challenge_config =
    jsonb_set(
      coalesce(
        v_config.daily_challenge_config,
        '{}'::jsonb
      ),
      '{challenges}',
      p_full_challenges,
      true
    ),
    updated_at =
      v_applied_at
  where id = 1;

  /*
   * Apply both Revival states.
   *
   * A completed daily challenge is
   * never reset by Admin configuration.
   */

  foreach v_game in array
    array[
      'black-pearl-rush',
      'cing-stack-tower'
    ]
  loop

    select r.value
    into v_entry
    from jsonb_array_elements(
      p_revival_challenges
    ) r(value)
    where r.value->>'game_key' =
      v_game;

    v_enabled :=
      (v_entry->>'enabled')::boolean;

    v_challenge_id := null;
    v_completed := false;
    v_type := null;
    v_target := null;
    v_reward := null;

    select c.id,
           c.completed
    into v_challenge_id,
         v_completed
    from public.daily_challenges c
    where c.challenge_date =
      v_challenge_date
      and c.game_key = v_game
    for update;

    if v_enabled then

      v_type :=
        v_entry->>'challenge_type';

      v_target :=
        (v_entry->>'target_value')::integer;

      v_reward :=
        (v_entry->>'reward_points')::integer;

      if v_challenge_id is null then

        insert into
          public.daily_challenges (
            challenge_date,
            game_key,
            challenge_type,
            target_value,
            reward_points,
            label
          )
        values (
          v_challenge_date,
          v_game,
          v_type,
          v_target,
          v_reward,
          (
            select
              f.value->>'label'
            from jsonb_array_elements(
              p_full_challenges
            ) f(value)
            where f.value->>'game_key'
              = v_game
          )
        )
        returning id
        into v_challenge_id;

      elsif not coalesce(
        v_completed,
        false
      ) then

        update
          public.daily_challenges
        set challenge_type =
              v_type,
            target_value =
              v_target,
            reward_points =
              v_reward,
            label = (
              select
                f.value->>'label'
              from jsonb_array_elements(
                p_full_challenges
              ) f(value)
              where f.value->>'game_key'
                = v_game
            )
        where id =
          v_challenge_id;

      end if;

    else

      /*
       * Preserve canonical daily reward identity.
       * Previously finalized sessions may still
       * claim through their bound enabled snapshot.
       * The disabled snapshot has NULL challenge_id.
       */
      v_challenge_id := null;

    end if;

    insert into
      public.cing_offline_revive_challenge_snapshots (
        apply_request_id,
        challenge_id,
        challenge_date,
        game_key,
        challenge_type,
        target_value,
        reward_points,
        applied_at,
        enabled,
        actor_admin_id,
        source
      )
    values (
      p_apply_request_id,
      v_challenge_id,
      v_challenge_date,
      v_game,
      v_type,
      v_target,
      v_reward,
      v_applied_at,
      v_enabled,
      v_admin_id,
      'admin_sync'
    );

    v_rows :=
      v_rows ||
      jsonb_build_array(
        jsonb_build_object(
          'game_key',
            v_game,
          'enabled',
            v_enabled,
          'challenge_id',
            v_challenge_id
        )
      );

  end loop;

  v_result :=
    jsonb_build_object(
      'applied', true,
      'replayed', false,
      'apply_request_id',
        p_apply_request_id,
      'challenge_date',
        v_challenge_date,
      'applied_at',
        v_applied_at,
      'games',
        v_rows
    );

  /*
   * Request identity and its result
   * commit atomically with config
   * and both snapshots.
   */

  insert into
    public.cing_offline_revive_admin_applies (
      apply_request_id,
      actor_admin_id,
      full_challenges,
      revival_challenges,
      challenge_date,
      applied_at,
      result
    )
  values (
    p_apply_request_id,
    v_admin_id,
    p_full_challenges,
    p_revival_challenges,
    v_challenge_date,
    v_applied_at,
    v_result
  );

  return v_result;

end;
$$;

/*
 * Backend service-role only.
 */

revoke all
on table
  public.cing_offline_revive_admin_applies
from
  public,
  anon,
  authenticated,
  service_role;

grant select, insert
on table
  public.cing_offline_revive_admin_applies
to service_role;

revoke all
on function
  public.cing_offline_revive_admin_apply_v1(
    uuid,
    text,
    jsonb,
    jsonb
  )
from
  public,
  anon,
  authenticated;

grant execute
on function
  public.cing_offline_revive_admin_apply_v1(
    uuid,
    text,
    jsonb,
    jsonb
  )
to service_role;

commit;
