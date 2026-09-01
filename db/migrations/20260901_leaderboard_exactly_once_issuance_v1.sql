/*
 * =====================================================
 * CING LEADERBOARD — EXACTLY-ONCE ISSUANCE V1
 * =====================================================
 *
 * Financial invariants:
 *
 * 1. One reset run per logical leaderboard period.
 * 2. One reward issuance per source/period/board/rank.
 * 3. Scheduler and manual actions share one DB authority.
 * 4. Winner snapshot + pending reward issuance +
 *    spending reset + reset marker advancement are atomic.
 * 5. Historical rewards are NOT backfilled or reclassified.
 */

BEGIN;


/* -----------------------------------------------------
 * Durable issuance identity on pending_rewards.
 * ----------------------------------------------------- */

ALTER TABLE public.pending_rewards
  ADD COLUMN IF NOT EXISTS reward_source text,
  ADD COLUMN IF NOT EXISTS reward_period_key text,
  ADD COLUMN IF NOT EXISTS reward_board_key text,
  ADD COLUMN IF NOT EXISTS reward_issuance_key text;

CREATE UNIQUE INDEX IF NOT EXISTS
  pending_rewards_reward_issuance_uidx
ON public.pending_rewards(reward_issuance_key)
WHERE reward_issuance_key IS NOT NULL;


/* -----------------------------------------------------
 * One durable row per reset period.
 * ----------------------------------------------------- */

CREATE TABLE IF NOT EXISTS
  public.leaderboard_reward_runs (
    id uuid PRIMARY KEY
      DEFAULT gen_random_uuid(),

    run_type text NOT NULL,
    period_key text NOT NULL,

    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,

    status text NOT NULL
      DEFAULT 'processing',

    rewards_created integer NOT NULL
      DEFAULT 0,

    started_at timestamptz NOT NULL
      DEFAULT now(),

    completed_at timestamptz,

    CONSTRAINT leaderboard_reward_runs_type_ck
      CHECK (
        run_type IN (
          'weekly',
          'monthly',
          'yearly'
        )
      ),

    CONSTRAINT leaderboard_reward_runs_status_ck
      CHECK (
        status IN (
          'processing',
          'completed'
        )
      ),

    CONSTRAINT leaderboard_reward_runs_period_ck
      CHECK (period_end > period_start),

    CONSTRAINT leaderboard_reward_runs_period_uidx
      UNIQUE(run_type, period_key)
  );


/* -----------------------------------------------------
 * Weekly authority.
 * ----------------------------------------------------- */

CREATE OR REPLACE FUNCTION
  public.issue_weekly_leaderboard_rewards_atomic(
    p_period_key text,
    p_period_start timestamptz,
    p_period_end timestamptz
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
  v_game record;
  v_winner record;
  v_reward jsonb;
  v_rank integer;
  v_created integer := 0;
  v_run_id uuid;
  v_board_name text;
  v_points integer;
  v_label text;
  v_last_reset timestamptz;
BEGIN
  IF p_period_key IS NULL
     OR btrim(p_period_key) = ''
  THEN
    RAISE EXCEPTION 'LEADERBOARD_PERIOD_KEY_REQUIRED';
  END IF;

  IF p_period_start IS NULL
     OR p_period_end IS NULL
     OR p_period_end <= p_period_start
  THEN
    RAISE EXCEPTION 'LEADERBOARD_PERIOD_WINDOW_INVALID';
  END IF;

  /*
   * One transaction-scoped lock for this logical run.
   * All scheduler/manual callers serialize here.
   */
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'cing:leaderboard:weekly:' ||
      p_period_key,
      0
    )
  );

  /*
   * If the period already completed, return idempotently.
   */
  SELECT id
  INTO v_run_id
  FROM public.leaderboard_reward_runs
  WHERE run_type = 'weekly'
    AND period_key = p_period_key
    AND status = 'completed';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_issued', true,
      'run_id', v_run_id,
      'period_key', p_period_key
    );
  END IF;

  /*
   * Lock configuration row for reset marker consistency.
   */
  SELECT
    leaderboard_config,
    last_weekly_reset
  INTO
    v_config,
    v_last_reset
  FROM public.app_configs
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEADERBOARD_CONFIG_NOT_FOUND';
  END IF;

  /*
   * Migration bridge:
   *
   * Periods already completed by the legacy scheduler have no
   * leaderboard_reward_runs row yet. The existing reset marker is
   * therefore authoritative evidence that this period must never
   * be replayed by a manual call after deployment.
   */
  IF v_last_reset IS NOT NULL
     AND v_last_reset >= p_period_end
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_issued', true,
      'legacy_reset_marker', true,
      'period_key', p_period_key
    );
  END IF;

  INSERT INTO public.leaderboard_reward_runs (
    run_type,
    period_key,
    period_start,
    period_end,
    status
  )
  VALUES (
    'weekly',
    p_period_key,
    p_period_start,
    p_period_end,
    'processing'
  )
  ON CONFLICT (run_type, period_key)
  DO NOTHING
  RETURNING id
  INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT id
    INTO v_run_id
    FROM public.leaderboard_reward_runs
    WHERE run_type = 'weekly'
      AND period_key = p_period_key;

    RETURN jsonb_build_object(
      'success', true,
      'already_issued', true,
      'run_id', v_run_id,
      'period_key', p_period_key
    );
  END IF;


  /*
   * ---------------------------------------------------
   * Weekly GAME leaderboards.
   * ---------------------------------------------------
   */

  FOR v_game IN
    SELECT
      e.key AS game_key,
      e.value AS cfg
    FROM jsonb_each(
      COALESCE(
        v_config->'games',
        '{}'::jsonb
      )
    ) AS e
    WHERE COALESCE(
      (e.value->>'enabled')::boolean,
      false
    ) = true
      AND COALESCE(
        (e.value->>'weekly_reset')::boolean,
        false
      ) = true
  LOOP
    v_board_name :=
      COALESCE(
        v_game.cfg->>'display_name',
        v_game.game_key
      );

    v_rank := 0;

    FOR v_winner IN
      WITH ranked_scores AS (
        SELECT
          gs.user_id,
          gs.player_name,
          gs.score,
          row_number() OVER (
            PARTITION BY gs.user_id
            ORDER BY
              gs.score DESC,
              gs.played_at ASC
          ) AS user_rn
        FROM public.game_scores gs
        WHERE gs.game_key = v_game.game_key
          AND gs.played_at >= p_period_start
          AND gs.played_at < p_period_end
      ),
      best_per_user AS (
        SELECT
          user_id,
          player_name,
          score
        FROM ranked_scores
        WHERE user_rn = 1
      )
      SELECT *
      FROM best_per_user
      ORDER BY score DESC, user_id ASC
      LIMIT 3
    LOOP
      v_rank := v_rank + 1;

      v_reward :=
        v_game.cfg
          ->'rewards'
          ->(v_rank - 1);

      v_points :=
        COALESCE(
          (v_reward->>'points')::integer,
          0
        );

      IF v_points <= 0 THEN
        CONTINUE;
      END IF;

      v_label :=
        COALESCE(
          v_reward->>'label',
          'Top ' || v_rank
        );

      INSERT INTO public.pending_rewards (
        user_id,
        player_name,
        points,
        reason,
        rank,
        board,
        claimed,
        created_at,
        reward_source,
        reward_period_key,
        reward_board_key,
        reward_issuance_key
      )
      VALUES (
        v_winner.user_id,
        COALESCE(
          v_winner.player_name,
          v_winner.user_id
        ),
        v_points,
        '🏆 ' || v_label ||
          ' BXH ' || v_board_name ||
          ' tuần',
        v_rank,
        v_board_name,
        false,
        now(),
        'leaderboard_weekly_game',
        p_period_key,
        'game:' || v_game.game_key,
        'leaderboard_weekly_game:' ||
          p_period_key || ':' ||
          v_game.game_key || ':rank:' ||
          v_rank
      )
      ON CONFLICT (reward_issuance_key)
      WHERE reward_issuance_key IS NOT NULL
      DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;
  END LOOP;


  /*
   * ---------------------------------------------------
   * Weekly SPENDING leaderboard.
   * ---------------------------------------------------
   */

  IF COALESCE(
    (
      v_config
        ->'spending'
        ->'weekly'
        ->>'enabled'
    )::boolean,
    false
  ) = true
  THEN
    v_rank := 0;

    FOR v_winner IN
      SELECT
        p.user_id,
        COALESCE(
          p.display_name,
          p.zalo_name,
          p.user_id
        ) AS player_name,
        p.crm_spend_weekly
      FROM public.players p
      WHERE COALESCE(
        p.crm_spend_weekly,
        0
      ) > 0
      ORDER BY
        p.crm_spend_weekly DESC,
        p.user_id ASC
      LIMIT 3
    LOOP
      v_rank := v_rank + 1;

      v_reward :=
        v_config
          ->'spending'
          ->'weekly'
          ->'rewards'
          ->(v_rank - 1);

      v_points :=
        COALESCE(
          (v_reward->>'points')::integer,
          0
        );

      IF v_points <= 0 THEN
        CONTINUE;
      END IF;

      v_label :=
        COALESCE(
          v_reward->>'label',
          'Top ' || v_rank
        );

      INSERT INTO public.pending_rewards (
        user_id,
        player_name,
        points,
        reason,
        rank,
        board,
        claimed,
        created_at,
        reward_source,
        reward_period_key,
        reward_board_key,
        reward_issuance_key
      )
      VALUES (
        v_winner.user_id,
        v_winner.player_name,
        v_points,
        '💰 ' || v_label ||
          ' BXH chi tiêu tuần',
        v_rank,
        'Chi tiêu tuần',
        false,
        now(),
        'leaderboard_weekly_spending',
        p_period_key,
        'spending:weekly',
        'leaderboard_weekly_spending:' ||
          p_period_key ||
          ':rank:' || v_rank
      )
      ON CONFLICT (reward_issuance_key)
      WHERE reward_issuance_key IS NOT NULL
      DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;

    UPDATE public.players
    SET crm_spend_weekly = 0
    WHERE COALESCE(
      crm_spend_weekly,
      0
    ) > 0;
  END IF;


  UPDATE public.app_configs
  SET last_weekly_reset = now()
  WHERE id = 1;

  UPDATE public.leaderboard_reward_runs
  SET
    status = 'completed',
    rewards_created = v_created,
    completed_at = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_issued', false,
    'run_id', v_run_id,
    'period_key', p_period_key,
    'rewards_created', v_created
  );
END;
$$;


/* -----------------------------------------------------
 * Generic spending-period authority:
 * monthly / yearly.
 * ----------------------------------------------------- */

CREATE OR REPLACE FUNCTION
  public.issue_spending_leaderboard_rewards_atomic(
    p_run_type text,
    p_period_key text,
    p_period_start timestamptz,
    p_period_end timestamptz
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config jsonb;
  v_period_cfg jsonb;
  v_winner record;
  v_reward jsonb;
  v_rank integer := 0;
  v_created integer := 0;
  v_run_id uuid;
  v_points integer;
  v_label text;
  v_board text;
  v_source text;
  v_board_key text;
  v_last_reset timestamptz;
BEGIN
  IF p_run_type NOT IN (
    'monthly',
    'yearly'
  ) THEN
    RAISE EXCEPTION
      'LEADERBOARD_RUN_TYPE_INVALID';
  END IF;

  IF p_period_key IS NULL
     OR btrim(p_period_key) = ''
  THEN
    RAISE EXCEPTION
      'LEADERBOARD_PERIOD_KEY_REQUIRED';
  END IF;

  IF p_period_start IS NULL
     OR p_period_end IS NULL
     OR p_period_end <= p_period_start
  THEN
    RAISE EXCEPTION
      'LEADERBOARD_PERIOD_WINDOW_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'cing:leaderboard:' ||
      p_run_type || ':' ||
      p_period_key,
      0
    )
  );

  SELECT id
  INTO v_run_id
  FROM public.leaderboard_reward_runs
  WHERE run_type = p_run_type
    AND period_key = p_period_key
    AND status = 'completed';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_issued', true,
      'run_id', v_run_id,
      'period_key', p_period_key
    );
  END IF;

  SELECT
    leaderboard_config,
    CASE
      WHEN p_run_type = 'monthly'
        THEN last_monthly_reset
      WHEN p_run_type = 'yearly'
        THEN last_yearly_reset
      ELSE NULL
    END
  INTO
    v_config,
    v_last_reset
  FROM public.app_configs
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'LEADERBOARD_CONFIG_NOT_FOUND';
  END IF;

  /*
   * Same migration bridge as weekly:
   * never replay a period already closed by legacy production.
   */
  IF v_last_reset IS NOT NULL
     AND v_last_reset >= p_period_end
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_issued', true,
      'legacy_reset_marker', true,
      'period_key', p_period_key
    );
  END IF;

  v_period_cfg :=
    v_config
      ->'spending'
      ->p_run_type;

  IF COALESCE(
    (v_period_cfg->>'enabled')::boolean,
    false
  ) <> true
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_issued', false,
      'disabled', true,
      'period_key', p_period_key,
      'rewards_created', 0
    );
  END IF;

  INSERT INTO public.leaderboard_reward_runs (
    run_type,
    period_key,
    period_start,
    period_end,
    status
  )
  VALUES (
    p_run_type,
    p_period_key,
    p_period_start,
    p_period_end,
    'processing'
  )
  ON CONFLICT (run_type, period_key)
  DO NOTHING
  RETURNING id
  INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT id
    INTO v_run_id
    FROM public.leaderboard_reward_runs
    WHERE run_type = p_run_type
      AND period_key = p_period_key;

    RETURN jsonb_build_object(
      'success', true,
      'already_issued', true,
      'run_id', v_run_id,
      'period_key', p_period_key
    );
  END IF;

  IF p_run_type = 'monthly' THEN
    v_board := 'Chi tiêu tháng';
    v_source :=
      'leaderboard_monthly_spending';
    v_board_key :=
      'spending:monthly';

    v_rank := 0;

    FOR v_winner IN
      SELECT
        p.user_id,
        COALESCE(
          p.display_name,
          p.zalo_name,
          p.user_id
        ) AS player_name,
        p.crm_spend_monthly AS amount
      FROM public.players p
      WHERE COALESCE(
        p.crm_spend_monthly,
        0
      ) > 0
      ORDER BY
        p.crm_spend_monthly DESC,
        p.user_id ASC
      LIMIT 3
    LOOP
      v_rank := v_rank + 1;

      v_reward :=
        v_period_cfg
          ->'rewards'
          ->(v_rank - 1);

      v_points :=
        COALESCE(
          (v_reward->>'points')::integer,
          0
        );

      IF v_points <= 0 THEN
        CONTINUE;
      END IF;

      v_label :=
        COALESCE(
          v_reward->>'label',
          'Top ' || v_rank
        );

      INSERT INTO public.pending_rewards (
        user_id,
        player_name,
        points,
        reason,
        rank,
        board,
        claimed,
        created_at,
        reward_source,
        reward_period_key,
        reward_board_key,
        reward_issuance_key
      )
      VALUES (
        v_winner.user_id,
        v_winner.player_name,
        v_points,
        '🏆 ' || v_label ||
          ' BXH chi tiêu tháng',
        v_rank,
        v_board,
        false,
        now(),
        v_source,
        p_period_key,
        v_board_key,
        v_source || ':' ||
          p_period_key ||
          ':rank:' || v_rank
      )
      ON CONFLICT (reward_issuance_key)
      WHERE reward_issuance_key IS NOT NULL
      DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;

    UPDATE public.players
    SET crm_spend_monthly = 0
    WHERE COALESCE(
      crm_spend_monthly,
      0
    ) > 0;

    UPDATE public.app_configs
    SET last_monthly_reset = now()
    WHERE id = 1;

  ELSE
    v_board := 'Chi tiêu năm';
    v_source :=
      'leaderboard_yearly_spending';
    v_board_key :=
      'spending:yearly';

    v_rank := 0;

    FOR v_winner IN
      SELECT
        p.user_id,
        COALESCE(
          p.display_name,
          p.zalo_name,
          p.user_id
        ) AS player_name,
        p.crm_spend_yearly AS amount
      FROM public.players p
      WHERE COALESCE(
        p.crm_spend_yearly,
        0
      ) > 0
      ORDER BY
        p.crm_spend_yearly DESC,
        p.user_id ASC
      LIMIT 3
    LOOP
      v_rank := v_rank + 1;

      v_reward :=
        v_period_cfg
          ->'rewards'
          ->(v_rank - 1);

      v_points :=
        COALESCE(
          (v_reward->>'points')::integer,
          0
        );

      IF v_points <= 0 THEN
        CONTINUE;
      END IF;

      v_label :=
        COALESCE(
          v_reward->>'label',
          'Top ' || v_rank
        );

      INSERT INTO public.pending_rewards (
        user_id,
        player_name,
        points,
        reason,
        rank,
        board,
        claimed,
        created_at,
        reward_source,
        reward_period_key,
        reward_board_key,
        reward_issuance_key
      )
      VALUES (
        v_winner.user_id,
        v_winner.player_name,
        v_points,
        '🏆 ' || v_label ||
          ' BXH chi tiêu năm',
        v_rank,
        v_board,
        false,
        now(),
        v_source,
        p_period_key,
        v_board_key,
        v_source || ':' ||
          p_period_key ||
          ':rank:' || v_rank
      )
      ON CONFLICT (reward_issuance_key)
      WHERE reward_issuance_key IS NOT NULL
      DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;

    UPDATE public.players
    SET crm_spend_yearly = 0
    WHERE COALESCE(
      crm_spend_yearly,
      0
    ) > 0;

    UPDATE public.app_configs
    SET last_yearly_reset = now()
    WHERE id = 1;
  END IF;

  UPDATE public.leaderboard_reward_runs
  SET
    status = 'completed',
    rewards_created = v_created,
    completed_at = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_issued', false,
    'run_id', v_run_id,
    'period_key', p_period_key,
    'rewards_created', v_created
  );
END;
$$;


/* -----------------------------------------------------
 * Service-role only.
 * ----------------------------------------------------- */

REVOKE ALL ON FUNCTION
  public.issue_weekly_leaderboard_rewards_atomic(
    text,
    timestamptz,
    timestamptz
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.issue_weekly_leaderboard_rewards_atomic(
    text,
    timestamptz,
    timestamptz
  )
TO service_role;

REVOKE ALL ON FUNCTION
  public.issue_spending_leaderboard_rewards_atomic(
    text,
    text,
    timestamptz,
    timestamptz
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.issue_spending_leaderboard_rewards_atomic(
    text,
    text,
    timestamptz,
    timestamptz
  )
TO service_role;


COMMIT;
