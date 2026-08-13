BEGIN;

-- =====================================================
-- NATIONAL DAY 2026 — PRODUCTION FINAL UPGRADE
-- Current production already has campaign_reward_claims.
-- Upgrade directly to pending-reward + atomic-claim model.
-- =====================================================

ALTER TABLE public.campaign_reward_claims
  ADD COLUMN IF NOT EXISTS ipos_sync_status text NOT NULL
    DEFAULT 'waiting_claim',

  ADD COLUMN IF NOT EXISTS ipos_retry_count integer NOT NULL
    DEFAULT 0,

  ADD COLUMN IF NOT EXISTS ipos_last_error text,

  ADD COLUMN IF NOT EXISTS ipos_next_retry_at timestamptz NOT NULL
    DEFAULT now(),

  ADD COLUMN IF NOT EXISTS ipos_synced_at timestamptz,

  ADD COLUMN IF NOT EXISTS ipos_locked_until timestamptz,

  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL
    DEFAULT now();

-- =====================================================
-- 1. LINK pending_rewards <-> campaign_reward_claims
-- =====================================================

ALTER TABLE public.pending_rewards
  ADD COLUMN IF NOT EXISTS campaign_claim_id uuid
    REFERENCES public.campaign_reward_claims(id)
    ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pending_rewards_campaign_claim_uidx
  ON public.pending_rewards(campaign_claim_id)
  WHERE campaign_claim_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pending_rewards_user_unclaimed_idx
  ON public.pending_rewards(user_id, created_at DESC)
  WHERE claimed = false;


-- =====================================================
-- 2. CAMPAIGN IPOS STATE:
--    waiting_claim = chưa được user bấm nhận
-- =====================================================

ALTER TABLE public.campaign_reward_claims
  DROP CONSTRAINT IF EXISTS campaign_reward_claims_ipos_sync_status_check;

ALTER TABLE public.campaign_reward_claims
  ADD CONSTRAINT campaign_reward_claims_ipos_sync_status_check
  CHECK (
    ipos_sync_status IN (
      'waiting_claim',
      'pending',
      'processing',
      'synced',
      'failed'
    )
  );


-- =====================================================
-- 3. LOGIN CAMPAIGN RPC
--
-- Login chỉ:
--   - xác định eligibility
--   - tạo campaign claim
--   - tạo pending reward
--
-- KHÔNG:
--   - cộng players.total_points
--   - ghi point_transactions
--   - sync iPOS
-- =====================================================

CREATE OR REPLACE FUNCTION public.claim_national_day_2026_login_reward(
  p_user_id text,
  p_phone_normalized text DEFAULT NULL,
  p_installation_id text DEFAULT NULL,
  p_source text DEFAULT 'zalo-miniapp'
)
RETURNS TABLE (
  reward_granted boolean,
  reward_code text,
  reward_amount integer,
  new_total_points numeric,
  claim_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();

  v_campaign_start constant timestamptz :=
    '2026-08-15 00:00:00+07'::timestamptz;

  v_campaign_end constant timestamptz :=
    '2026-10-01 00:00:00+07'::timestamptz;

  v_reward_code constant text :=
    'national_day_2026_login_29';

  v_reward_amount constant integer := 29;

  v_claim_id uuid;
  v_current_points numeric := 0;

  v_installation_id text :=
    NULLIF(
      btrim(
        COALESCE(
          p_installation_id,
          ''
        )
      ),
      ''
    );
BEGIN
  IF p_user_id IS NULL
     OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION
      'invalid_campaign_reward_user';
  END IF;

  SELECT COALESCE(total_points, 0)
  INTO v_current_points
  FROM public.players
  WHERE user_id = p_user_id;

  v_current_points :=
    COALESCE(v_current_points, 0);

  -- Ngoài campaign: không tạo quà.
  IF v_now < v_campaign_start
     OR v_now >= v_campaign_end THEN

    RETURN QUERY
    SELECT
      false,
      v_reward_code,
      0,
      v_current_points,
      NULL::uuid;

    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.campaign_reward_claims (
      reward_code,
      user_id,
      phone_normalized,
      installation_id,
      reward_amount,
      source,
      claimed_at,
      metadata,
      ipos_sync_status,
      ipos_retry_count,
      ipos_next_retry_at,
      updated_at
    )
    VALUES (
      v_reward_code,
      p_user_id,
      NULLIF(
        btrim(
          COALESCE(
            p_phone_normalized,
            ''
          )
        ),
        ''
      ),
      v_installation_id,
      v_reward_amount,
      COALESCE(
        NULLIF(
          btrim(p_source),
          ''
        ),
        'zalo-miniapp'
      ),
      v_now,
      jsonb_build_object(
        'campaign_start',
        v_campaign_start,
        'campaign_end_exclusive',
        v_campaign_end
      ),
      'waiting_claim',
      0,
      v_now,
      v_now
    )
    RETURNING id
    INTO v_claim_id;

  EXCEPTION
    WHEN unique_violation THEN

      RETURN QUERY
      SELECT
        false,
        v_reward_code,
        0,
        v_current_points,
        NULL::uuid;

      RETURN;
  END;

  INSERT INTO public.pending_rewards (
    user_id,
    player_name,
    points,
    reason,
    rank,
    board,
    claimed,
    claimed_at,
    created_at,
    campaign_claim_id
  )
  SELECT
    p_user_id,
    COALESCE(
      NULLIF(
        btrim(
          COALESCE(
            pl.display_name,
            ''
          )
        ),
        ''
      ),
      NULLIF(
        btrim(
          COALESCE(
            pl.zalo_name,
            ''
          )
        ),
        ''
      ),
      'Hội viên'
    ),
    v_reward_amount,
    '🇻🇳 Quốc khánh 2/9 — Quà đăng nhập ứng dụng',
    NULL,
    'Quốc khánh 2/9',
    false,
    NULL,
    v_now,
    v_claim_id
  FROM public.players pl
  WHERE pl.user_id = p_user_id;

  -- Trường hợp players chưa tồn tại.
  IF NOT FOUND THEN
    INSERT INTO public.pending_rewards (
      user_id,
      player_name,
      points,
      reason,
      rank,
      board,
      claimed,
      claimed_at,
      created_at,
      campaign_claim_id
    )
    VALUES (
      p_user_id,
      'Hội viên',
      v_reward_amount,
      '🇻🇳 Quốc khánh 2/9 — Quà đăng nhập ứng dụng',
      NULL,
      'Quốc khánh 2/9',
      false,
      NULL,
      v_now,
      v_claim_id
    );
  END IF;

  RETURN QUERY
  SELECT
    true,
    v_reward_code,
    v_reward_amount,
    v_current_points,
    v_claim_id;
END;
$$;


-- =====================================================
-- 4. ATOMIC PENDING REWARD CLAIM
--
-- Một transaction duy nhất:
--   lock reward
--   lock player
--   cộng points
--   point_transactions
--   mark claimed
--   release campaign iPOS job
-- =====================================================

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

  -- Idempotent:
  -- double tap / concurrent request không cộng lần 2.
  IF COALESCE(v_reward.claimed, false) THEN

    SELECT COALESCE(total_points, 0)::integer
    INTO v_after
    FROM public.players
    WHERE players.user_id = v_reward.user_id;

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

  -- Bảo đảm player tồn tại.
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
  ON CONFLICT (user_id)
  DO NOTHING;

  -- Serialize mọi claim cùng user.
  SELECT COALESCE(total_points, 0)::integer
  INTO v_before
  FROM public.players
  WHERE players.user_id = v_reward.user_id
  FOR UPDATE;

  UPDATE public.players
  SET total_points =
    COALESCE(total_points, 0)
    + v_reward.points
  WHERE players.user_id = v_reward.user_id
  RETURNING total_points::integer
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

  -- Chỉ sau khi user đã nhận thành công,
  -- campaign mới được phép sync +29 sang iPOS.
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
ON FUNCTION public.claim_national_day_2026_login_reward(
  text,
  text,
  text,
  text
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.claim_national_day_2026_login_reward(
  text,
  text,
  text,
  text
)
TO service_role;


REVOKE ALL
ON FUNCTION public.claim_pending_reward_atomic(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.claim_pending_reward_atomic(uuid)
TO service_role;

CREATE INDEX IF NOT EXISTS campaign_reward_claims_ipos_pending_idx
  ON public.campaign_reward_claims (
    ipos_next_retry_at,
    claimed_at
  )
  WHERE ipos_sync_status = 'pending';

COMMIT;
