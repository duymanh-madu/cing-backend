begin;

/*
 * CING GAME CENTER V2
 *
 * Durable score delivery foundation for:
 * - cing-stack-tower
 * - black-pearl-rush
 *
 * Exactly one outbox entry per finalized
 * offline revival score.
 *
 * Do not alter the existing finalize RPC.
 * The AFTER INSERT trigger participates
 * in the score's PostgreSQL transaction.
 *
 * No legacy game score, Block Puzzle,
 * Wallet, credit or loyalty mutation.
 */

create table
  public.cing_offline_revive_score_outbox (
    score_id bigint primary key
      references public.game_scores(id)
      on delete restrict,

    session_id uuid not null unique
      references
        public.cing_offline_revive_sessions(id)
      on delete restrict,

    game_key text not null
      check (
        game_key in (
          'cing-stack-tower',
          'black-pearl-rush'
        )
      ),

    user_id text not null
      check (length(btrim(user_id)) > 0),

    status text not null default 'pending'
      check (
        status in (
          'pending',
          'processing',
          'delivered',
          'failed'
        )
      ),

    attempt_count integer not null default 0
      check (attempt_count >= 0),

    next_attempt_at timestamptz not null
      default now(),

    locked_until timestamptz,

    worker_token uuid,

    analytics_done boolean not null
      default false,

    leaderboard_done boolean not null
      default false,

    top1_done boolean not null
      default false,

    last_error text,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now(),

    delivered_at timestamptz,

    constraint
      cing_offline_revive_score_outbox_state_ck
    check (
      (
        status = 'processing'
        and locked_until is not null
        and worker_token is not null
      )
      or
      (
        status <> 'processing'
        and locked_until is null
        and worker_token is null
      )
    ),

    constraint
      cing_offline_revive_score_outbox_complete_ck
    check (
      (
        status = 'delivered'
        and analytics_done
        and leaderboard_done
        and top1_done
        and delivered_at is not null
      )
      or
      (
        status <> 'delivered'
        and delivered_at is null
      )
    )
  );

create index
  cing_offline_revive_score_outbox_due_idx
on public.cing_offline_revive_score_outbox (
  next_attempt_at,
  created_at
)
where status = 'pending';

create index
  cing_offline_revive_score_outbox_lease_idx
on public.cing_offline_revive_score_outbox (
  locked_until
)
where status = 'processing';

/*
 * The trigger does not write scores.
 *
 * The bound game and user are copied
 * from the score already inserted by
 * the verified finalize RPC.
 */

create function
  public.cing_offline_revive_enqueue_score_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.offline_revive_session_id is null then
    return new;
  end if;

  insert into
    public.cing_offline_revive_score_outbox (
      score_id,
      session_id,
      game_key,
      user_id
    )
  values (
    new.id,
    new.offline_revive_session_id,
    new.game_key,
    new.user_id
  );

  return new;
end;
$$;

create trigger
  cing_offline_revive_enqueue_score_after_insert
after insert
on public.game_scores
for each row
when (
  new.offline_revive_session_id is not null
)
execute function
  public.cing_offline_revive_enqueue_score_v1();

/*
 * Keep the queue private to the backend.
 *
 * Later migrations will provide narrow,
 * service-role-only claim/ack RPCs with
 * lease-token fencing.
 */

revoke all
on table
  public.cing_offline_revive_score_outbox
from public, anon, authenticated;

grant select
on table
  public.cing_offline_revive_score_outbox
to service_role;

revoke all
on function
  public.cing_offline_revive_enqueue_score_v1()
from public, anon, authenticated,
     service_role;

commit;
