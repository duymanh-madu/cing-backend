begin;

/*
 * CING GAME CENTER V2
 * OFFLINE REVIVAL SESSION FOUNDATION V1
 *
 * Only:
 * - cing-stack-tower
 * - black-pearl-rush
 *
 * Block Puzzle retains its existing PostgreSQL
 * session and replay authority.
 *
 * This migration creates no sessions and
 * mutates no player or financial balance.
 */

create table public.cing_offline_revive_sessions (

  id uuid primary key,

  request_id uuid not null,

  user_id text not null,

  game_key text not null,

  status text not null default 'active',

  revives_used integer not null default 0,

  event_seq integer not null default 0,

  pending_reason text,

  pending_at timestamptz,

  created_at timestamptz not null default now(),

  expires_at timestamptz not null,

  finalized_at timestamptz,

  constraint cing_offline_revive_user_ck
    check (btrim(user_id) <> ''),

  constraint cing_offline_revive_game_ck
    check (
      game_key in (
        'cing-stack-tower',
        'black-pearl-rush'
      )
    ),

  constraint cing_offline_revive_count_ck
    check (revives_used between 0 and 5),

  constraint cing_offline_revive_event_seq_ck
    check (event_seq >= 0),

  constraint cing_offline_revive_status_ck
    check (
      status in (
        'active',
        'revive_pending',
        'finalized'
      )
    ),

  constraint cing_offline_revive_pending_reason_ck
    check (
      pending_reason is null
      or (
        game_key = 'cing-stack-tower'
        and pending_reason = 'timeout'
      )
      or (
        game_key = 'black-pearl-rush'
        and pending_reason = 'death'
      )
    ),

  constraint cing_offline_revive_lifecycle_ck
    check (
      (
        status = 'active'
        and pending_reason is null
        and pending_at is null
        and finalized_at is null
      )
      or
      (
        status = 'revive_pending'
        and pending_reason is not null
        and pending_at is not null
        and finalized_at is null
      )
      or
      (
        status = 'finalized'
        and pending_reason is null
        and pending_at is null
        and finalized_at is not null
      )
    ),

  constraint cing_offline_revive_expiry_ck
    check (expires_at > created_at),

  constraint cing_offline_revive_final_time_ck
    check (
      finalized_at is null
      or finalized_at >= created_at
    ),

  constraint cing_offline_revive_pending_time_ck
    check (
      pending_at is null
      or pending_at >= created_at
    ),

  constraint cing_offline_revive_request_uq
    unique (user_id, request_id)

);

create index
  cing_offline_revive_user_created_idx
on public.cing_offline_revive_sessions (
  user_id,
  created_at desc
);

create index
  cing_offline_revive_active_expiry_idx
on public.cing_offline_revive_sessions (
  expires_at
)
where status <> 'finalized';

/*
 * No client-side session mutation.
 * Business-domain RPCs will own lifecycle changes.
 */

revoke all
on table public.cing_offline_revive_sessions
from public, anon, authenticated, service_role;

grant select
on table public.cing_offline_revive_sessions
to service_role;

commit;
