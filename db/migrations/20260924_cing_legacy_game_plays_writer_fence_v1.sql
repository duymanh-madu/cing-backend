begin;

/*
 * CING GAME CENTER V2
 * LEGACY GAME-PLAYS WRITER FENCE V1
 *
 * DORMANT INSTALLATION:
 * The gate starts OPEN.
 * No conversion is executed.
 * No legacy balance is reset.
 * No financial transaction is modified.
 */

create table
  public.cing_legacy_game_plays_writer_gate (
    gate_id integer primary key
      default 1,

    is_closed boolean not null
      default false,

    changed_at timestamptz not null
      default clock_timestamp(),

    constraint
      cing_legacy_game_plays_gate_singleton_ck
    check (gate_id = 1)
  );

insert into
  public.cing_legacy_game_plays_writer_gate (
    gate_id,
    is_closed
  )
values (
  1,
  false
);

/*
 * Application roles cannot operate the gate.
 *
 * Privileged closure is a separate future
 * operational action, not part of this migration.
 */

revoke all
on table
  public.cing_legacy_game_plays_writer_gate
from
  public,
  anon,
  authenticated,
  service_role;

/*
 * Shared gate-row locks are held until the
 * calling transaction ends.
 *
 * A future gate UPDATE must wait for existing
 * participating legacy mutations to finish.
 *
 * Writers arriving after closure observe
 * is_closed = true and cannot mutate game_plays.
 */

create function
public.cing_legacy_game_plays_writer_guard_v1()

returns trigger

language plpgsql

security definer

set search_path = public

as $function$

declare
  v_is_closed boolean;
begin

  /*
   * An UPDATE that preserves the actual balance
   * does not need to participate in the fence.
   */

  if TG_OP = 'UPDATE' then

    if NEW.game_plays
      is not distinct from
      OLD.game_plays
    then
      return NEW;
    end if;

  end if;

  /*
   * Lock the canonical gate row.
   */

  select g.is_closed
  into v_is_closed

  from
    public.cing_legacy_game_plays_writer_gate g

  where g.gate_id = 1

  for share;

  if not found then

    raise exception
      'LEGACY_GAME_PLAYS_GATE_MISSING'
      using errcode = '55000';

  end if;

  /*
   * OPEN: preserve current V1 behavior.
   */

  if not v_is_closed then
    return NEW;
  end if;

  /*
   * CLOSED: permit new players with zero
   * legacy plays, but reject positive or
   * negative initial legacy balances.
   */

  if TG_OP = 'INSERT' then

    if coalesce(NEW.game_plays, 0) = 0
    then
      return NEW;
    end if;

  end if;

  raise exception
    'LEGACY_GAME_PLAYS_WRITER_FENCED'
    using errcode = '55000';

end;

$function$;

/*
 * Cover direct JavaScript mutations and
 * SECURITY DEFINER RPC mutations alike.
 */

create trigger
  cing_legacy_game_plays_update_guard_v1

before update of game_plays

on public.players

for each row

execute function
  public.cing_legacy_game_plays_writer_guard_v1();

/*
 * Cover player creation during and after
 * the future cutover.
 */

create trigger
  cing_legacy_game_plays_insert_guard_v1

before insert

on public.players

for each row

execute function
  public.cing_legacy_game_plays_writer_guard_v1();

revoke all

on function
  public.cing_legacy_game_plays_writer_guard_v1()

from
  public,
  anon,
  authenticated,
  service_role;

commit;
