begin;

/*
 * CING GAME CENTER V2
 *
 * Admin Challenge Configuration Snapshot V1.
 *
 * Records individual Admin configuration
 * applications for the two offline Revival games.
 *
 * This migration does NOT:
 * - create daily challenges;
 * - award points;
 * - send notifications;
 * - mutate Wallet, plays or revive credits;
 * - change existing Daily Challenge RPCs;
 * - start a worker.
 *
 * A future authenticated Admin writer must
 * create each snapshot at the time a config
 * is successfully applied.
 *
 * No legacy fallback config may be backfilled
 * or represented as Admin-authorized.
 */

create table
  public.cing_offline_revive_challenge_snapshots (

    snapshot_id uuid not null
      default gen_random_uuid()
      primary key,

    /*
     * One Admin application request can
     * contain multiple games.
     * Retry cannot insert the same game twice.
     */
    apply_request_id uuid not null,

    /*
     * Disabled games may have no canonical
     * daily_challenges row to reference.
     */
    challenge_id uuid,

    challenge_date date not null,

    game_key text not null
      check (
        game_key in (
          'black-pearl-rush',
          'cing-stack-tower'
        )
      ),

    challenge_type text
      check (
        challenge_type in (
          'combo',
          'score'
        )
      ),

    target_value integer
      check (
        target_value between 1 and 1000000
      ),

    reward_points integer
      check (
        reward_points between 1 and 1000000
      ),

    /*
     * Timestamp belongs to PostgreSQL.
     *
     * The future Admin writer must not accept
     * a frontend-supplied effective timestamp.
     */

    applied_at timestamptz not null
      default clock_timestamp(),

    enabled boolean not null,

    actor_admin_id text not null
      check (
        length(btrim(actor_admin_id)) > 0
      ),

    source text not null
      default 'admin_sync'
      check (
        source = 'admin_sync'
      ),

    /*
     * Enabled revisions have a complete
     * canonical challenge and reward.
     *
     * Disabled revisions are explicit
     * tombstones without invented values.
     */
    constraint
      cing_offline_revive_snapshot_enabled_ck
      check (
        (
          enabled = true
          and challenge_id is not null
          and challenge_type is not null
          and target_value is not null
          and reward_points is not null
        )
        or
        (
          enabled = false
          and challenge_id is null
          and challenge_type is null
          and target_value is null
          and reward_points is null
        )
      ),

    constraint
      cing_offline_revive_snapshot_request_uq
      unique (
        apply_request_id,
        game_key
      )
  );

/*
 * Multiple applications within one Vietnam
 * calendar day are preserved.
 *
 * No UNIQUE(challenge_date, game_key):
 * a single day may have multiple revisions.
 */

create index
  cing_offline_revive_challenge_snapshot_time_idx

on public.cing_offline_revive_challenge_snapshots (
  challenge_date,
  game_key,
  applied_at desc
);

/*
 * Do not add a cascading foreign key to
 * daily_challenges in V1.
 *
 * Legacy daily challenge reset currently
 * deletes today's rows. Its contract must be
 * reviewed before binding lifecycle rules.
 *
 * Future reward authority must verify that
 * snapshot.challenge_id still matches an
 * actual canonical daily_challenges row.
 */

/*
 * The browser cannot read or write the
 * snapshot table directly.
 *
 * The backend service role may INSERT an
 * Admin-authorized application and SELECT
 * historical applications.
 *
 * Ordinary UPDATE and DELETE privileges
 * are not granted.
 */

revoke all
on table
  public.cing_offline_revive_challenge_snapshots

from
  public,
  anon,
  authenticated,
  service_role;

grant select, insert
on table
  public.cing_offline_revive_challenge_snapshots

to service_role;

commit;
