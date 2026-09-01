BEGIN;

/*
 * ============================================================
 * CING PENDING REWARD — DURABLE iPOS DELIVERY V1
 * ============================================================
 *
 * Scope:
 * - leaderboard / ordinary pending rewards
 * - campaign rewards keep their existing campaign-specific
 *   durable iPOS authority
 *
 * Guarantees:
 * - local reward mutation is atomic and exactly-once
 * - iPOS delivery intent is persisted in the same transaction
 * - retry state is durable
 * - reward id is the immutable external delivery identity
 */

ALTER TABLE public.pending_rewards
  ADD COLUMN IF NOT EXISTS ipos_sync_status text,
  ADD COLUMN IF NOT EXISTS ipos_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ipos_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS ipos_locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS ipos_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS ipos_last_error text;

ALTER TABLE public.pending_rewards
  DROP CONSTRAINT IF EXISTS pending_rewards_ipos_sync_status_ck;

ALTER TABLE public.pending_rewards
  ADD CONSTRAINT pending_rewards_ipos_sync_status_ck
  CHECK (
    ipos_sync_status IS NULL
    OR ipos_sync_status IN (
      'pending',
      'processing',
      'synced',
      'failed'
    )
  );

ALTER TABLE public.pending_rewards
  DROP CONSTRAINT IF EXISTS pending_rewards_ipos_retry_count_ck;

ALTER TABLE public.pending_rewards
  ADD CONSTRAINT pending_rewards_ipos_retry_count_ck
  CHECK (ipos_retry_count >= 0);

CREATE INDEX IF NOT EXISTS
  pending_rewards_ipos_pending_idx
ON public.pending_rewards (
  ipos_next_retry_at,
  claimed_at,
  id
)
WHERE
  claimed = true
  AND campaign_claim_id IS NULL
  AND ipos_sync_status = 'pending';


/*
 * Replace the existing atomic claim authority.
 *
 * Campaign reward:
 *   existing campaign_reward_claims delivery is released.
 *
 * Ordinary/BXH reward:
 *   pending_rewards itself becomes durable iPOS outbox.
 */
CREATE OR REPLACE FUNCTION public.claim_pending_reward_atomic(
  p_reward_id uuid
)
RETURNS TABLE (
  success boolean,
  already_claimed boolean,
  reward_id uuid,
  user_id text,
  points integer,
  new_total_points integer,
  campaign_claim_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward public.pending_rewards%ROWTYPE;
  v_before integer := 0;
  v_after integer := 0;
  v_now timestamptz := now();
BEGIN
  SELECT *
  INTO v_reward
  FROM public.pending_rewards
  WHERE id = p_reward_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'pending_reward_not_found';
  END IF;

  IF COALESCE(v_reward.claimed, false) THEN
    SELECT COALESCE(p.total_points, 0)::integer
    INTO v_after
    FROM public.players AS p
    WHERE p.user_id = v_reward.user_id;

    RETURN QUERY
    SELECT
      true,
      true,
      v_reward.id,
      v_reward.user_id,
      v_reward.points,
      COALESCE(v_after, 0),
      v_reward.campaign_claim_id;

    RETURN;
  END IF;

  IF v_reward.points IS NULL
     OR v_reward.points <= 0 THEN
    RAISE EXCEPTION
      'invalid_pending_reward_points';
  END IF;

  INSERT INTO public.players (
    user_id,
    total_points,
    game_plays
  )
  VALUES (
    v_reward.user_id,
    0,
    0
  )
  ON CONFLICT ON CONSTRAINT players_user_id_key
  DO NOTHING;

  SELECT COALESCE(p.total_points, 0)::integer
  INTO v_before
  FROM public.players AS p
  WHERE p.user_id = v_reward.user_id
  FOR UPDATE;

  UPDATE public.players AS p
  SET total_points =
    COALESCE(p.total_points, 0)
    + v_reward.points
  WHERE p.user_id = v_reward.user_id
  RETURNING p.total_points::integer
  INTO v_after;

  INSERT INTO public.point_transactions (
    user_id,
    order_id,
    transaction_type,
    points,
    balance_before,
    balance_after,
    reason,
    metadata,
    created_at
  )
  VALUES (
    v_reward.user_id,
    NULL,
    'add',
    v_reward.points,
    v_before,
    v_after,
    COALESCE(
      NULLIF(btrim(v_reward.reason), ''),
      'Nhận điểm thưởng'
    ),
    jsonb_strip_nulls(
      jsonb_build_object(
        'phone',
        v_reward.user_id,
        'pending_reward_id',
        v_reward.id,
        'campaign_claim_id',
        v_reward.campaign_claim_id
      )
    ),
    v_now
  );

  UPDATE public.pending_rewards
  SET
    claimed = true,
    claimed_at = v_now,

    /*
     * Campaigns own their iPOS lifecycle elsewhere.
     * Ordinary rewards persist delivery intent here.
     */
    ipos_sync_status =
      CASE
        WHEN v_reward.campaign_claim_id IS NULL
          THEN 'pending'
        ELSE ipos_sync_status
      END,
    ipos_retry_count =
      CASE
        WHEN v_reward.campaign_claim_id IS NULL
          THEN 0
        ELSE ipos_retry_count
      END,
    ipos_next_retry_at =
      CASE
        WHEN v_reward.campaign_claim_id IS NULL
          THEN v_now
        ELSE ipos_next_retry_at
      END,
    ipos_locked_until =
      CASE
        WHEN v_reward.campaign_claim_id IS NULL
          THEN NULL
        ELSE ipos_locked_until
      END,
    ipos_last_error =
      CASE
        WHEN v_reward.campaign_claim_id IS NULL
          THEN NULL
        ELSE ipos_last_error
      END
  WHERE id = v_reward.id;

  IF v_reward.campaign_claim_id IS NOT NULL THEN
    UPDATE public.campaign_reward_claims
    SET
      ipos_sync_status = 'pending',
      ipos_retry_count = 0,
      ipos_last_error = NULL,
      ipos_next_retry_at = v_now,
      ipos_locked_until = NULL,
      updated_at = v_now
    WHERE id = v_reward.campaign_claim_id
      AND ipos_sync_status = 'waiting_claim';
  END IF;

  RETURN QUERY
  SELECT
    true,
    false,
    v_reward.id,
    v_reward.user_id,
    v_reward.points,
    v_after,
    v_reward.campaign_claim_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.claim_pending_reward_atomic(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.claim_pending_reward_atomic(uuid)
FROM anon;

REVOKE ALL
ON FUNCTION public.claim_pending_reward_atomic(uuid)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.claim_pending_reward_atomic(uuid)
TO service_role;

COMMIT;
