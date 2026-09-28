begin;

/*
 * CING GAME CENTER V2
 *
 * Durable score analytics identity.
 *
 * Existing analytics_events remains
 * the compatibility read model.
 *
 * Exactly one game_score analytics event
 * per offline revival score_id.
 *
 * Legacy game_score events without
 * offline_revive_score_id are outside
 * this uniqueness contract.
 *
 * This migration does not insert
 * analytics events or modify scores.
 */

/*
 * Validate the exact supported schema.
 *
 * JSON and JSONB both support ->>.
 * Do not assume an unrelated analytics
 * table definition from source files.
 */

do $$
declare
  v_event_name_type text;
  v_event_data_type text;
begin
  select c.udt_name
    into v_event_name_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'analytics_events'
    and c.column_name = 'event_name';

  select c.udt_name
    into v_event_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'analytics_events'
    and c.column_name = 'event_data';

  if v_event_name_type
       not in ('text', 'varchar')
     or v_event_name_type is null
  then
    raise exception
      'REVIVAL_ANALYTICS_EVENT_NAME_SCHEMA_INVALID'
      using errcode = '55000';
  end if;

  if v_event_data_type
       not in ('json', 'jsonb')
     or v_event_data_type is null
  then
    raise exception
      'REVIVAL_ANALYTICS_EVENT_DATA_SCHEMA_INVALID'
      using errcode = '55000';
  end if;
end;
$$;

/*
 * Fail closed if data already violates
 * the proposed unique identity.
 *
 * Do not silently delete or rewrite
 * existing analytics events.
 */

do $$
begin
  if exists (
    select 1
    from public.analytics_events ae
    where ae.event_name = 'game_score'
      and nullif(
        ae.event_data
          ->> 'offline_revive_score_id',
        ''
      ) is not null
    group by
      ae.event_data
        ->> 'offline_revive_score_id'
    having count(*) > 1
  ) then
    raise exception
      'REVIVAL_ANALYTICS_SCORE_IDENTITY_DUPLICATED'
      using errcode = '23505';
  end if;
end;
$$;

/*
 * Partial unique index.
 *
 * This does NOT enforce one game_score
 * event per user or per game.
 *
 * Every new finalized score has its
 * own independent score_id.
 */

create unique index
  analytics_events_offline_revive_score_uidx

on public.analytics_events (
  (
    event_data
      ->> 'offline_revive_score_id'
  )
)

where event_name = 'game_score'
  and nullif(
    event_data
      ->> 'offline_revive_score_id',
    ''
  ) is not null;

commit;
