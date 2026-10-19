-- ============================================================
-- CING KDS PRO V1 — DURABLE EVENT 11 INGESTION
-- DORMANT / DO NOT EXECUTE IN PRODUCTION
--
-- Dependency:
-- 20261002_cing_kds_event_inbox_v1.sql
--
-- No live webhook wiring.
-- No payment verification authority.
-- No automatic KDS order materialization.
-- ============================================================

-- Record conflicting snapshots without replacing
-- the original transaction payload.

CREATE TABLE public.cing_kds_inbox_conflicts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    inbox_id uuid NOT NULL
      REFERENCES public.cing_kds_event_inbox(id),

    incoming_fingerprint text NOT NULL
      CHECK (incoming_fingerprint ~ '^[0-9a-f]{64}$'),

    incoming_snapshot jsonb NOT NULL
      CHECK (jsonb_typeof(incoming_snapshot) = 'object'),

    detected_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE (inbox_id, incoming_fingerprint)
);

ALTER TABLE public.cing_kds_inbox_conflicts
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cing_kds_inbox_conflicts
FROM PUBLIC, anon, authenticated, service_role;

-- Create and revoke within the same migration transaction.
-- Migration runner must execute atomically.

CREATE FUNCTION public.cing_kds_receive_event11_atomic_v1(
    p_pos_parent text,
    p_pos_id bigint,
    p_tran_id text,
    p_source_event_id text,
    p_fingerprint text,
    p_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_inbox_id uuid;
    v_fingerprint text;
    v_status text;
    v_inserted boolean := false;
    v_pos_parent text;
    v_tran_id text;
    v_pos_id bigint;
    v_cups jsonb;
BEGIN
    -- Input must originate from the canonical
    -- Event 11 normalizer.
    -- This function does not authenticate iPOS itself.

    IF p_pos_parent IS NULL
       OR length(btrim(p_pos_parent)) = 0
       OR length(p_pos_parent) > 200
       OR p_pos_id IS NULL
       OR p_pos_id <= 0
       OR p_tran_id IS NULL
       OR length(btrim(p_tran_id)) = 0
       OR length(p_tran_id) > 200
       OR p_fingerprint IS NULL
       OR p_fingerprint !~ '^[0-9a-f]{64}$'
       OR p_snapshot IS NULL
       OR jsonb_typeof(p_snapshot) <> 'object'
    THEN
        RAISE EXCEPTION 'KDS_INVALID_INGESTION_INPUT';
    END IF;

    -- Check normalized snapshot identity.
    v_pos_parent := p_snapshot->>'pos_parent';
    v_tran_id := p_snapshot->>'tran_id';

    IF v_pos_parent IS DISTINCT FROM p_pos_parent
       OR v_tran_id IS DISTINCT FROM p_tran_id
       OR jsonb_typeof(p_snapshot->'pos_id') <> 'number'
       OR (p_snapshot->>'pos_id') !~ '^[0-9]+$'
    THEN
        RAISE EXCEPTION 'KDS_SNAPSHOT_IDENTITY_MISMATCH';
    END IF;

    BEGIN
        v_pos_id := (p_snapshot->>'pos_id')::bigint;
    EXCEPTION WHEN numeric_value_out_of_range THEN
        RAISE EXCEPTION 'KDS_SNAPSHOT_POS_ID_INVALID';
    END;

    IF v_pos_id <> p_pos_id THEN
        RAISE EXCEPTION 'KDS_SNAPSHOT_POS_ID_MISMATCH';
    END IF;

    v_cups := p_snapshot->'cups';

    IF jsonb_typeof(v_cups) IS DISTINCT FROM 'array'
       OR jsonb_array_length(
           CASE
             WHEN jsonb_typeof(v_cups) = 'array'
             THEN v_cups
             ELSE '[]'::jsonb
           END
       ) NOT BETWEEN 1 AND 1000
    THEN
        RAISE EXCEPTION 'KDS_INVALID_CUP_SNAPSHOT';
    END IF;

    -- Attempt insertion against the durable unique
    -- transaction key. Conflict is handled by DB.
    INSERT INTO public.cing_kds_event_inbox (
        source,
        pos_parent,
        pos_id,
        tran_id,
        source_event_id,
        fingerprint,
        event_snapshot,
        payment_verification,
        ingestion_status
    )
    VALUES (
        'ipos_event_11',
        p_pos_parent,
        p_pos_id,
        p_tran_id,
        p_source_event_id,
        p_fingerprint,
        p_snapshot,
        'pending_verification',
        'pending'
    )
    ON CONFLICT (pos_parent, tran_id)
    DO NOTHING
    RETURNING id INTO v_inbox_id;

    v_inserted := FOUND;

    IF v_inserted THEN
        RETURN jsonb_build_object(
            'outcome', 'inserted',
            'inbox_id', v_inbox_id,
            'payment_verification',
                'pending_verification'
        );
    END IF;

    -- Serialize duplicate and conflict handling.
    SELECT
        id,
        fingerprint,
        ingestion_status
    INTO
        v_inbox_id,
        v_fingerprint,
        v_status
    FROM public.cing_kds_event_inbox
    WHERE pos_parent = p_pos_parent
      AND tran_id = p_tran_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'KDS_INBOX_RACE_RETRY';
    END IF;

    IF v_fingerprint = p_fingerprint THEN
        RETURN jsonb_build_object(
            'outcome', 'duplicate',
            'inbox_id', v_inbox_id,
            'ingestion_status', v_status
        );
    END IF;

    -- Preserve original snapshot; record incoming
    -- conflicting version for manual reconciliation.
    INSERT INTO public.cing_kds_inbox_conflicts (
        inbox_id,
        incoming_fingerprint,
        incoming_snapshot
    )
    VALUES (
        v_inbox_id,
        p_fingerprint,
        p_snapshot
    )
    ON CONFLICT (inbox_id, incoming_fingerprint)
    DO NOTHING;

    UPDATE public.cing_kds_event_inbox
    SET ingestion_status = 'review_required'
    WHERE id = v_inbox_id;

    RETURN jsonb_build_object(
        'outcome', 'review_required',
        'inbox_id', v_inbox_id,
        'reason', 'KDS_TRANSACTION_PAYLOAD_CHANGED'
    );
END;
$function$;

REVOKE ALL ON FUNCTION
public.cing_kds_receive_event11_atomic_v1(
    text, bigint, text, text, text, jsonb
)
FROM PUBLIC, anon, authenticated, service_role;

-- No GRANT EXECUTE.
-- No trigger.
-- No webhook integration.
-- No payment verification.
-- No operational activation.
