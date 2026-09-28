begin;

/*
 * CING GAME CENTER V2
 * Independent Reward Delivery state.
 *
 * Existing Score Delivery status and
 * its three stage flags are untouched.
 *
 * Historical outbox rows remain NULL:
 * no automatic retroactive reward.
 */

alter table
  public.cing_offline_revive_score_outbox

add column reward_status text,

add column reward_attempt_count
  integer not null default 0,

add column reward_next_attempt_at
  timestamptz default now(),

add column reward_locked_until
  timestamptz,

add column reward_worker_token
  uuid,

add column reward_last_error
  text,

add column reward_processed_at
  timestamptz,

add column reward_applied
  boolean,

add column reward_challenge_id
  uuid,

add column reward_snapshot_id
  uuid,

add column reward_notification_status
  text,

add column reward_notification_sent_at
  timestamptz;

/*
 * Only future INSERTs default to pending.
 * Existing rows retain NULL.
 */

alter table
  public.cing_offline_revive_score_outbox

alter column reward_status
  set default 'pending';

alter table
  public.cing_offline_revive_score_outbox

add constraint
  cing_revive_reward_status_ck

check (
  reward_status is null
  or reward_status in (
    'pending',
    'processing',
    'completed',
    'skipped',
    'failed'
  )
),

add constraint
  cing_revive_reward_attempt_ck

check (
  reward_attempt_count >= 0
),

add constraint
  cing_revive_reward_lease_ck

check (
  (
    reward_status = 'processing'
    and reward_worker_token is not null
    and reward_locked_until is not null
  )
  or
  (
    reward_status is distinct from
      'processing'
    and reward_worker_token is null
    and reward_locked_until is null
  )
),

add constraint
  cing_revive_reward_notification_ck

check (
  reward_notification_status is null
  or reward_notification_status in (
    'pending',
    'processing',
    'delivered',
    'failed'
  )
);

/*
 * Reward can be claimed regardless
 * of Score Delivery's status.
 */

create index
  cing_revive_reward_due_idx

on public.cing_offline_revive_score_outbox (
  reward_next_attempt_at,
  created_at,
  score_id
)

where reward_status = 'pending';

create index
  cing_revive_reward_lease_idx

on public.cing_offline_revive_score_outbox (
  reward_locked_until
)

where reward_status = 'processing';

commit;
