-- ============================================================
-- CING KDS PRO V1
-- ATOMIC CUP TRANSITION AUTHORITY
--
-- DORMANT: no backend EXECUTE grant.
-- DO NOT EXECUTE IN PRODUCTION WITHOUT RELEASE APPROVAL.
--
-- Depends on:
-- 20261002_cing_kds_foundation_v1.sql
-- ============================================================

CREATE OR REPLACE FUNCTION
public.cing_kds_transition_cup_atomic_v1(
    p_cup_id uuid,
    p_actor_id text,
    p_action_key text,
    p_target_status text,
    p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_status text;
    v_version bigint;
    v_payment text;
    v_existing public.cing_kds_cup_audit%ROWTYPE;
    v_next_version bigint;
    v_occurred_at timestamptz;
    v_audit_id uuid;
BEGIN
    -- 1. Strict input validation.
    IF p_cup_id IS NULL
       OR p_actor_id IS NULL
       OR length(btrim(p_actor_id)) = 0
       OR length(p_actor_id) > 200
       OR p_action_key IS NULL
       OR length(btrim(p_action_key)) = 0
       OR length(p_action_key) > 200
       OR p_target_status IS NULL
       OR p_expected_version IS NULL
       OR p_expected_version < 0
    THEN
        RAISE EXCEPTION 'KDS_INVALID_INPUT';
    END IF;

    -- 2. Serialize mutations for this cup.
    SELECT
        c.status,
        c.version,
        o.payment_verification
    INTO
        v_status,
        v_version,
        v_payment
    FROM public.cing_kds_cups AS c
    JOIN public.cing_kds_orders AS o
      ON o.id = c.order_id
    WHERE c.id = p_cup_id
    FOR UPDATE OF c;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'KDS_CUP_NOT_FOUND';
    END IF;

    -- 3. Only verified paid orders are operable.
    IF v_payment <> 'verified' THEN
        RAISE EXCEPTION 'KDS_PAYMENT_NOT_VERIFIED';
    END IF;

    -- 4. Durable idempotency replay after acquiring lock.
    SELECT *
    INTO v_existing
    FROM public.cing_kds_cup_audit
    WHERE cup_id = p_cup_id
      AND action_key = p_action_key;

    IF FOUND THEN
        IF v_existing.actor_id <> p_actor_id
           OR v_existing.to_status <> p_target_status
           OR v_existing.previous_version <> p_expected_version
        THEN
            RAISE EXCEPTION 'KDS_IDEMPOTENCY_CONFLICT';
        END IF;

        RETURN jsonb_build_object(
            'outcome', 'replayed',
            'cup_id', p_cup_id,
            'audit_id', v_existing.id,
            'transition_version', v_existing.new_version,
            'current_version', v_version,
            'current_status', v_status
        );
    END IF;

    -- 5. Optimistic version invariant.
    IF v_version <> p_expected_version THEN
        RAISE EXCEPTION 'KDS_VERSION_CONFLICT';
    END IF;

    -- 6. Explicit legal transitions.
    IF NOT (
        (v_status = 'pending'
         AND p_target_status = 'preparing')
        OR
        (v_status = 'preparing'
         AND p_target_status = 'prepared')
        OR
        (v_status = 'prepared'
         AND p_target_status = 'served')
    ) THEN
        RAISE EXCEPTION 'KDS_INVALID_TRANSITION';
    END IF;

    -- 7. Reject version overflow.
    IF v_version = 9223372036854775807 THEN
        RAISE EXCEPTION 'KDS_VERSION_OVERFLOW';
    END IF;

    v_next_version := v_version + 1;
    v_occurred_at := clock_timestamp();

    -- 8. Update exactly one cup.
    UPDATE public.cing_kds_cups
    SET
        status = p_target_status,
        version = v_next_version,
        prepared_at = CASE
            WHEN p_target_status = 'prepared'
            THEN v_occurred_at
            ELSE prepared_at
        END,
        served_at = CASE
            WHEN p_target_status = 'served'
            THEN v_occurred_at
            ELSE served_at
        END
    WHERE id = p_cup_id
      AND version = v_version;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'KDS_CONCURRENT_UPDATE';
    END IF;

    -- 9. Audit inserted inside the same transaction.
    INSERT INTO public.cing_kds_cup_audit (
        cup_id,
        action_key,
        actor_id,
        from_status,
        to_status,
        previous_version,
        new_version,
        occurred_at
    )
    VALUES (
        p_cup_id,
        p_action_key,
        p_actor_id,
        v_status,
        p_target_status,
        v_version,
        v_next_version,
        v_occurred_at
    )
    RETURNING id INTO v_audit_id;

    -- Any failure rolls back both update and audit.
    RETURN jsonb_build_object(
        'outcome', 'applied',
        'cup_id', p_cup_id,
        'audit_id', v_audit_id,
        'transition_version', v_next_version,
        'current_version', v_next_version,
        'current_status', p_target_status,
        'occurred_at', v_occurred_at
    );
END;
$function$;

-- Function is deliberately dormant.
-- Do not expose to clients or service_role yet.

REVOKE ALL ON FUNCTION
public.cing_kds_transition_cup_atomic_v1(
    uuid, text, text, text, bigint
)
FROM PUBLIC, anon, authenticated, service_role;

-- No trigger.
-- No worker.
-- No webhook integration.
-- No production activation.
