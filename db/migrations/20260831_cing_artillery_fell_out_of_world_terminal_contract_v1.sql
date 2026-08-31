/*
 * Cing Piu Piu
 * 5J4C — fell_out_of_world terminal contract V1
 *
 * Preserve the canonical production terminal lifecycle
 * established by unplayed-match abandonment.
 *
 * The only semantic extension is:
 *
 *   completed + hp_depleted
 *     ->
 *   completed + (
 *     hp_depleted |
 *     fell_out_of_world
 *   )
 *
 * fell_out_of_world is a PLAYER terminal reason.
 * Projectile out_of_bounds remains a shot-resolution outcome.
 *
 * This migration does not introduce:
 *   - mutable player position
 *   - terrain support authority
 *   - fall simulation
 *   - shot-resolution changes
 *   - public execution authority
 */

BEGIN;


-- =====================================================
-- MATCH TERMINAL LIFECYCLE
-- =====================================================

ALTER TABLE public.cing_artillery_matches
  DROP CONSTRAINT
    cing_artillery_matches_terminal_lifecycle_check;

ALTER TABLE public.cing_artillery_matches
  ADD CONSTRAINT
    cing_artillery_matches_terminal_lifecycle_check
  CHECK (
    (
      status = 'matched'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL
      AND completion_reason IS NULL
      AND completed_at IS NULL
    )

    OR

    (
      status = 'completed'

      AND winner_account_id IS NOT NULL
      AND loser_account_id IS NOT NULL
      AND winner_account_id <> loser_account_id

      AND completion_reason IN (
        'hp_depleted',
        'fell_out_of_world'
      )

      AND completed_at IS NOT NULL
      AND completed_at >= matched_at

      AND (
        (
          winner_account_id =
            player_one_account_id
          AND loser_account_id =
            player_two_account_id
        )
        OR
        (
          winner_account_id =
            player_two_account_id
          AND loser_account_id =
            player_one_account_id
        )
      )
    )

    OR

    (
      status = 'abandoned'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL

      AND completion_reason =
        'abandoned'

      AND completed_at IS NOT NULL
      AND completed_at >= matched_at
    )
  );


-- =====================================================
-- MATCH RUNTIME TERMINAL LIFECYCLE
-- =====================================================

ALTER TABLE public.cing_artillery_match_runtimes
  DROP CONSTRAINT
    cing_artillery_match_runtimes_terminal_lifecycle_check;

ALTER TABLE public.cing_artillery_match_runtimes
  ADD CONSTRAINT
    cing_artillery_match_runtimes_terminal_lifecycle_check
  CHECK (
    (
      status = 'ready'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL
      AND completion_reason IS NULL
      AND completed_at IS NULL
    )

    OR

    (
      status = 'completed'

      AND winner_account_id IS NOT NULL
      AND loser_account_id IS NOT NULL
      AND winner_account_id <> loser_account_id

      AND completion_reason IN (
        'hp_depleted',
        'fell_out_of_world'
      )

      AND completed_at IS NOT NULL
      AND completed_at >= initialized_at

      AND (
        (
          winner_account_id =
            player_one_account_id
          AND loser_account_id =
            player_two_account_id
        )
        OR
        (
          winner_account_id =
            player_two_account_id
          AND loser_account_id =
            player_one_account_id
        )
      )
    )

    OR

    (
      status = 'abandoned'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL

      AND completion_reason =
        'abandoned'

      AND completed_at IS NOT NULL
      AND completed_at >= initialized_at
    )
  );


-- =====================================================
-- COMBAT STATE TERMINAL LIFECYCLE
-- =====================================================

ALTER TABLE public.cing_artillery_combat_states
  DROP CONSTRAINT
    cing_artillery_combat_states_terminal_lifecycle_check;

ALTER TABLE public.cing_artillery_combat_states
  ADD CONSTRAINT
    cing_artillery_combat_states_terminal_lifecycle_check
  CHECK (
    (
      status = 'initialized'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL
      AND completion_reason IS NULL
      AND completed_at IS NULL
    )

    OR

    (
      status = 'completed'

      AND winner_account_id IS NOT NULL
      AND loser_account_id IS NOT NULL
      AND winner_account_id <> loser_account_id

      AND completion_reason IN (
        'hp_depleted',
        'fell_out_of_world'
      )

      AND completed_at IS NOT NULL
      AND completed_at >= initialized_at

      AND (
        (
          winner_account_id =
            player_one_account_id
          AND loser_account_id =
            player_two_account_id
        )
        OR
        (
          winner_account_id =
            player_two_account_id
          AND loser_account_id =
            player_one_account_id
        )
      )
    )

    OR

    (
      status = 'abandoned'

      AND winner_account_id IS NULL
      AND loser_account_id IS NULL

      AND completion_reason =
        'abandoned'

      AND completed_at IS NOT NULL
      AND completed_at >= initialized_at
    )
  );


COMMIT;
