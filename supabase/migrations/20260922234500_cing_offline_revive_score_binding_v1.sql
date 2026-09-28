begin;

/*
 * CING GAME CENTER V2
 * OFFLINE REVIVAL SCORE SESSION BINDING V1
 *
 * Applies only to:
 * - cing-stack-tower
 * - black-pearl-rush
 *
 * Existing legacy score rows remain unchanged.
 * Existing Block Puzzle authority remains unchanged.
 *
 * This migration creates the exactly-once
 * database binding required by the future
 * offline revival finalize RPC.
 *
 * It does not submit scores, finalize sessions,
 * award loyalty points or mutate Wallet.
 */

alter table public.game_scores
  add column if not exists
    offline_revive_session_id uuid;

/*
 * Fail closed if a same-named column exists
 * with an unexpected PostgreSQL type.
 */

do $$
declare
  v_type text;
begin
  select c.udt_name
    into v_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'game_scores'
    and c.column_name =
      'offline_revive_session_id';

  if v_type is distinct from 'uuid' then
    raise exception
      'REVIVAL_SCORE_SESSION_COLUMN_TYPE_INVALID';
  end if;
end;
$$;

/*
 * Every non-null score binding must reference
 * an existing offline revival session.
 */

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid =
      'public.game_scores'::regclass
      and c.conname =
        'game_scores_offline_revive_session_fk'
  ) then

    alter table public.game_scores
      add constraint
        game_scores_offline_revive_session_fk
      foreign key (
        offline_revive_session_id
      )
      references
        public.cing_offline_revive_sessions(id)
      on update restrict
      on delete restrict;

  end if;
end;
$$;

/*
 * Only these two games may bind a score
 * to an offline revival session.
 *
 * The NULL case intentionally preserves
 * legacy rows until the authorized cutover.
 */

alter table public.game_scores
  add constraint
    game_scores_offline_revive_game_ck
  check (
    offline_revive_session_id is null
    or game_key in (
      'cing-stack-tower',
      'black-pearl-rush'
    )
  );

/*
 * Exactly-once persistence:
 *
 * One offline revival session may produce
 * at most one game_scores row.
 *
 * Does not affect other games' NULL values.
 */

create unique index
  game_scores_offline_revive_session_uq
on public.game_scores (
  offline_revive_session_id
)
where
  offline_revive_session_id is not null;

/*
 * No generic score-writing privilege added.
 * No browser EXECUTE privilege added.
 * No existing score row mutated.
 */

commit;
