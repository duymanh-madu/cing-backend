BEGIN;

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
      NULLIF(
        btrim(v_reward.reason),
        ''
      ),
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
    claimed_at = v_now
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
