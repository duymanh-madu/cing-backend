-- ============================================================
-- CING KDS PRO V1
-- ATOMIC EVENT INBOX -> ORDER -> CUPS MATERIALIZATION
--
-- DORMANT. DO NOT EXECUTE IN PRODUCTION.
-- NO PAYMENT VERIFICATION AUTHORITY.
-- NO WEBHOOK OR RUNTIME WIRING.
--
-- Required invariant:
--   one canonical paid transaction -> one order
--   one normalized unit_key -> one cup
--
-- Order started_at deliberately means KDS durable intake time,
-- NOT the unverified original iPOS payment/creation timestamp.
-- ============================================================

ALTER TABLE public.cing_kds_orders
ADD COLUMN IF NOT EXISTS started_at timestamptz;

CREATE FUNCTION public.cing_kds_materialize_inbox_atomic_v1(
    p_inbox_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_inbox public.cing_kds_event_inbox%ROWTYPE;
    v_order public.cing_kds_orders%ROWTYPE;
    v_snapshot jsonb;
    v_cups jsonb;
    v_count integer;
    v_inserted integer;
    v_pos_id bigint;
BEGIN
    IF p_inbox_id IS NULL THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_INVALID_INPUT';
    END IF;

    -- Serialize materialization, replay and conflict decisions.
    SELECT *
    INTO v_inbox
    FROM public.cing_kds_event_inbox
    WHERE id = p_inbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'KDS_INBOX_NOT_FOUND';
    END IF;

    -- Conflicts are not silently resolved.
    IF v_inbox.ingestion_status = 'review_required'
       OR EXISTS (
           SELECT 1
           FROM public.cing_kds_inbox_conflicts
           WHERE inbox_id = p_inbox_id
       )
    THEN
        RAISE EXCEPTION 'KDS_INBOX_REVIEW_REQUIRED';
    END IF;

    -- No verification is granted by this function.
    IF v_inbox.payment_verification <> 'verified' THEN
        RAISE EXCEPTION 'KDS_PAYMENT_NOT_VERIFIED';
    END IF;

    v_snapshot := v_inbox.event_snapshot;
    v_cups := v_snapshot->'cups';

    IF v_snapshot->>'pos_parent'
           IS DISTINCT FROM v_inbox.pos_parent
       OR v_snapshot->>'tran_id'
           IS DISTINCT FROM v_inbox.tran_id
       OR jsonb_typeof(v_snapshot->'pos_id') <> 'number'
       OR (v_snapshot->>'pos_id') !~ '^[0-9]+$'
    THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_IDENTITY_MISMATCH';
    END IF;

    BEGIN
        v_pos_id := (v_snapshot->>'pos_id')::bigint;
    EXCEPTION WHEN numeric_value_out_of_range THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_POS_ID_INVALID';
    END;

    IF v_pos_id <> v_inbox.pos_id THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_BRANCH_MISMATCH';
    END IF;

    IF jsonb_typeof(v_cups) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_CUPS_INVALID';
    END IF;

    v_count := jsonb_array_length(v_cups);

    IF v_count NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_CUP_COUNT_INVALID';
    END IF;

    -- Every cup must be structurally complete before inserts.
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_cups) AS entry(value)
        WHERE jsonb_typeof(entry.value) <> 'object'
           OR nullif(btrim(entry.value->>'unit_key'), '') IS NULL
           OR nullif(btrim(entry.value->>'item_id'), '') IS NULL
           OR nullif(btrim(entry.value->>'item_name'), '') IS NULL
           OR length(entry.value->>'unit_key') > 200
           OR length(entry.value->>'item_id') > 200
           OR length(entry.value->>'item_name') > 500
    ) THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_CUP_INVALID';
    END IF;

    IF (
        SELECT count(DISTINCT entry.value->>'unit_key')
        FROM jsonb_array_elements(v_cups) AS entry(value)
    ) <> v_count THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_DUPLICATE_UNIT_KEY';
    END IF;

    -- Idempotent retry must find the existing durable projection.
    IF v_inbox.ingestion_status = 'processed' THEN
        SELECT *
        INTO v_order
        FROM public.cing_kds_orders
        WHERE pos_parent = v_inbox.pos_parent
          AND tran_id = v_inbox.tran_id;

        IF NOT FOUND
           OR v_order.pos_id <> v_inbox.pos_id
           OR v_order.payment_verification <> 'verified'
           OR v_order.started_at IS DISTINCT FROM v_inbox.received_at
           OR (
               SELECT count(*)
               FROM public.cing_kds_cups
               WHERE order_id = v_order.id
           ) <> v_count
        THEN
            RAISE EXCEPTION 'KDS_MATERIALIZE_REPLAY_INVARIANT';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_cups) AS entry(value)
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.cing_kds_cups c
                WHERE c.order_id = v_order.id
                  AND c.unit_key = entry.value->>'unit_key'
                  AND c.item_id = entry.value->>'item_id'
                  AND c.item_name = entry.value->>'item_name'
            )
        ) THEN
            RAISE EXCEPTION 'KDS_MATERIALIZE_REPLAY_MISMATCH';
        END IF;

        RETURN jsonb_build_object(
            'outcome', 'replayed',
            'order_id', v_order.id,
            'cup_count', v_count
        );
    END IF;

    IF v_inbox.ingestion_status <> 'pending' THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_STATUS_INVALID';
    END IF;

    -- Any unexpected existing order is an authority conflict.
    IF EXISTS (
        SELECT 1
        FROM public.cing_kds_orders
        WHERE pos_parent = v_inbox.pos_parent
          AND tran_id = v_inbox.tran_id
    ) THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_ORDER_CONFLICT';
    END IF;

    INSERT INTO public.cing_kds_orders (
        pos_parent,
        pos_id,
        tran_id,
        tran_no,
        pos_name,
        source_event_id,
        payment_verification,
        tran_date_raw,
        hub_created_at_raw,
        received_at,
        started_at
    )
    VALUES (
        v_inbox.pos_parent,
        v_inbox.pos_id,
        v_inbox.tran_id,
        v_snapshot->>'tran_no',
        v_snapshot->>'pos_name',
        v_inbox.source_event_id,
        'verified',
        v_snapshot->>'tran_date_raw',
        v_snapshot->>'hub_created_at_raw',
        v_inbox.received_at,
        v_inbox.received_at
    )
    RETURNING * INTO v_order;

    INSERT INTO public.cing_kds_cups (
        order_id,
        unit_key,
        item_id,
        item_name,
        item_group,
        status,
        version
    )
    SELECT
        v_order.id,
        entry.value->>'unit_key',
        entry.value->>'item_id',
        entry.value->>'item_name',
        nullif(entry.value->>'item_group', ''),
        'pending',
        0
    FROM jsonb_array_elements(v_cups) AS entry(value);

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted <> v_count THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_CUP_COUNT_MISMATCH';
    END IF;

    UPDATE public.cing_kds_event_inbox
    SET ingestion_status = 'processed',
        processed_at = clock_timestamp()
    WHERE id = p_inbox_id
      AND ingestion_status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'KDS_MATERIALIZE_INBOX_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
        'outcome', 'materialized',
        'order_id', v_order.id,
        'cup_count', v_count
    );
END;
$function$;

REVOKE ALL ON FUNCTION
public.cing_kds_materialize_inbox_atomic_v1(uuid)
FROM PUBLIC, anon, authenticated, service_role;

-- No EXECUTE grant.
-- No public endpoint.
-- No automatic payment confirmation.
-- No worker or webhook integration.
