-- ============================================================
-- CING KDS FABi C03 RECONCILIATION QUEUE V1
--
-- DORMANT / NOT APPLIED BY THIS BLOCK.
--
-- Purpose:
--   A transaction that has durable C04 history but whose C03
--   final invoice is not yet visible MUST remain independently
--   recoverable after the C04 polling checkpoint advances.
--
-- Exact identity:
--   company_uid + brand_uid + store_uid + tran_id
--
-- Status:
--   pending_c03
--   ready
--   review_required
--
-- This table is NOT:
--   payment authority
--   final invoice authority
--   source completeness authority
--
-- C03 paid-final reconciliation remains authoritative.
-- ============================================================

create table if not exists
public.cing_kds_fabi_reconciliation_queue_v1 (
    company_uid text not null
        check (length(btrim(company_uid)) > 0),

    brand_uid text not null
        check (length(btrim(brand_uid)) > 0),

    store_uid text not null
        check (length(btrim(store_uid)) > 0),

    tran_id text not null
        check (length(btrim(tran_id)) > 0),

    reconciliation_status text not null
        check (
            reconciliation_status in (
                'pending_c03',
                'ready',
                'review_required'
            )
        ),

    state_fingerprint text not null
        check (
            state_fingerprint ~ '^[a-f0-9]{64}$'
        ),

    result_version bigint not null
        default 1
        check (result_version >= 1),

    attempt_count bigint not null
        default 0
        check (attempt_count >= 0),

    next_reconcile_at timestamptz null,
    last_attempt_at timestamptz null,

    claim_token uuid null,
    claim_expires_at timestamptz null,

    first_observed_at timestamptz not null
        default clock_timestamp(),

    last_result_at timestamptz not null
        default clock_timestamp(),

    created_at timestamptz not null
        default clock_timestamp(),

    updated_at timestamptz not null
        default clock_timestamp(),

    primary key (
        company_uid,
        brand_uid,
        store_uid,
        tran_id
    ),

    constraint cing_kds_fabi_recon_claim_pair_ck
        check (
            (
                claim_token is null
                and claim_expires_at is null
            )
            or
            (
                claim_token is not null
                and claim_expires_at is not null
            )
        ),

    constraint cing_kds_fabi_recon_schedule_ck
        check (
            (
                reconciliation_status = 'pending_c03'
                and next_reconcile_at is not null
            )
            or
            (
                reconciliation_status in (
                    'ready',
                    'review_required'
                )
                and next_reconcile_at is null
            )
        )
);

create index if not exists
    cing_kds_fabi_reconciliation_due_idx
on public.cing_kds_fabi_reconciliation_queue_v1 (
    company_uid,
    brand_uid,
    store_uid,
    reconciliation_status,
    next_reconcile_at,
    tran_id
)
where reconciliation_status = 'pending_c03';

alter table
    public.cing_kds_fabi_reconciliation_queue_v1
enable row level security;

revoke all
on table public.cing_kds_fabi_reconciliation_queue_v1
from public;

revoke all
on table public.cing_kds_fabi_reconciliation_queue_v1
from anon;

revoke all
on table public.cing_kds_fabi_reconciliation_queue_v1
from authenticated;

revoke all
on table public.cing_kds_fabi_reconciliation_queue_v1
from service_role;

-- ============================================================
-- RESULT PUT
--
-- Called after the normal C04 -> durable reload -> reducer ->
-- C03 reconciliation pipeline has classified a transaction.
--
-- Every fresh result:
--   * is durable before branch checkpoint commit
--   * increments result_version
--   * clears any old retry claim
--
-- Therefore an older claimed retry cannot overwrite a newer
-- C04 observation/result.
-- ============================================================

create or replace function
public.cing_kds_fabi_reconciliation_result_put_v1(
    p_company_uid text,
    p_brand_uid text,
    p_store_uid text,
    p_tran_id text,
    p_status text,
    p_state_fingerprint text,
    p_retry_delay_seconds integer
)
returns table (
    reconciliation_status text,
    result_version bigint,
    attempt_count bigint,
    next_reconcile_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_now timestamptz;
    v_row public.cing_kds_fabi_reconciliation_queue_v1%rowtype;
    v_next timestamptz;
begin
    if p_company_uid is null
       or length(btrim(p_company_uid)) = 0
       or p_brand_uid is null
       or length(btrim(p_brand_uid)) = 0
       or p_store_uid is null
       or length(btrim(p_store_uid)) = 0
       or p_tran_id is null
       or length(btrim(p_tran_id)) = 0 then
        raise exception
            'CING_KDS_RECON_IDENTITY_REQUIRED';
    end if;

    if p_status is null
       or p_status not in (
           'pending_c03',
           'ready',
           'review_required'
       ) then
        raise exception
            'CING_KDS_RECON_STATUS_INVALID';
    end if;

    if p_state_fingerprint is null
       or p_state_fingerprint !~ '^[a-f0-9]{64}$' then
        raise exception
            'CING_KDS_RECON_FINGERPRINT_INVALID';
    end if;

    if p_status = 'pending_c03' then
        if p_retry_delay_seconds is null
           or p_retry_delay_seconds < 1
           or p_retry_delay_seconds > 32400 then
            raise exception
                'CING_KDS_RECON_RETRY_DELAY_INVALID';
        end if;
    elsif p_retry_delay_seconds is not null then
        raise exception
            'CING_KDS_RECON_TERMINAL_RETRY_FORBIDDEN';
    end if;

    v_now :=
        clock_timestamp();

    v_next :=
        case
            when p_status = 'pending_c03'
            then v_now
                 + make_interval(
                     secs => p_retry_delay_seconds
                   )
            else null
        end;

    insert into
        public.cing_kds_fabi_reconciliation_queue_v1 (
            company_uid,
            brand_uid,
            store_uid,
            tran_id,
            reconciliation_status,
            state_fingerprint,
            result_version,
            attempt_count,
            next_reconcile_at,
            claim_token,
            claim_expires_at,
            first_observed_at,
            last_result_at,
            created_at,
            updated_at
        )
    values (
        btrim(p_company_uid),
        btrim(p_brand_uid),
        btrim(p_store_uid),
        btrim(p_tran_id),
        p_status,
        p_state_fingerprint,
        1,
        0,
        v_next,
        null,
        null,
        v_now,
        v_now,
        v_now,
        v_now
    )
    on conflict (
        company_uid,
        brand_uid,
        store_uid,
        tran_id
    )
    do update
    set
        reconciliation_status =
            excluded.reconciliation_status,

        state_fingerprint =
            excluded.state_fingerprint,

        /*
         * Exact overlap replay is observationally idempotent.
         *
         * Re-seeing the same reduced state/status MUST NOT:
         *   - advance result_version
         *   - postpone next_reconcile_at
         *   - invalidate an active retry claim
         *
         * A real state/status change does all three.
         */
        result_version =
            case
                when
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .reconciliation_status
                        is not distinct from
                        excluded.reconciliation_status
                    and
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .state_fingerprint
                        is not distinct from
                        excluded.state_fingerprint
                then
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .result_version
                else
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .result_version + 1
            end,

        next_reconcile_at =
            case
                when
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .reconciliation_status
                        is not distinct from
                        excluded.reconciliation_status
                    and
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .state_fingerprint
                        is not distinct from
                        excluded.state_fingerprint
                then
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .next_reconcile_at
                else
                    excluded.next_reconcile_at
            end,

        claim_token =
            case
                when
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .reconciliation_status
                        is not distinct from
                        excluded.reconciliation_status
                    and
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .state_fingerprint
                        is not distinct from
                        excluded.state_fingerprint
                then
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .claim_token
                else
                    null
            end,

        claim_expires_at =
            case
                when
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .reconciliation_status
                        is not distinct from
                        excluded.reconciliation_status
                    and
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .state_fingerprint
                        is not distinct from
                        excluded.state_fingerprint
                then
                    public.cing_kds_fabi_reconciliation_queue_v1
                        .claim_expires_at
                else
                    null
            end,

        last_result_at =
            v_now,

        updated_at =
            v_now
    returning *
    into v_row;

    return query
    select
        v_row.reconciliation_status,
        v_row.result_version,
        v_row.attempt_count,
        v_row.next_reconcile_at;
end;
$$;

-- ============================================================
-- CLAIM DUE
--
-- Claims pending transactions for ONE exact FABi branch.
-- FOR UPDATE SKIP LOCKED permits safe multi-worker batching.
--
-- Each claimed transaction gets its own UUID.
-- ============================================================

create or replace function
public.cing_kds_fabi_reconciliation_claim_due_v1(
    p_company_uid text,
    p_brand_uid text,
    p_store_uid text,
    p_batch_size integer,
    p_lease_seconds integer
)
returns table (
    tran_id text,
    claim_token uuid,
    result_version bigint,
    state_fingerprint text,
    attempt_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_now timestamptz;
    v_candidate record;
    v_token uuid;
begin
    if p_company_uid is null
       or length(btrim(p_company_uid)) = 0
       or p_brand_uid is null
       or length(btrim(p_brand_uid)) = 0
       or p_store_uid is null
       or length(btrim(p_store_uid)) = 0 then
        raise exception
            'CING_KDS_RECON_CLAIM_SCOPE_REQUIRED';
    end if;

    if p_batch_size is null
       or p_batch_size < 1
       or p_batch_size > 100 then
        raise exception
            'CING_KDS_RECON_BATCH_SIZE_INVALID';
    end if;

    if p_lease_seconds is null
       or p_lease_seconds < 30
       or p_lease_seconds > 900 then
        raise exception
            'CING_KDS_RECON_LEASE_SECONDS_INVALID';
    end if;

    v_now :=
        clock_timestamp();

    for v_candidate in
        select
            q.company_uid,
            q.brand_uid,
            q.store_uid,
            q.tran_id
        from
            public.cing_kds_fabi_reconciliation_queue_v1 q
        where
            q.company_uid = btrim(p_company_uid)
            and q.brand_uid = btrim(p_brand_uid)
            and q.store_uid = btrim(p_store_uid)
            and q.reconciliation_status = 'pending_c03'
            and q.next_reconcile_at <= v_now
            and (
                q.claim_token is null
                or q.claim_expires_at <= v_now
            )
        order by
            q.next_reconcile_at asc,
            q.tran_id asc
        for update skip locked
        limit p_batch_size
    loop
        v_token :=
            gen_random_uuid();

        update
            public.cing_kds_fabi_reconciliation_queue_v1 q
        set
            claim_token =
                v_token,

            claim_expires_at =
                v_now
                + make_interval(
                    secs => p_lease_seconds
                  ),

            attempt_count =
                q.attempt_count + 1,

            last_attempt_at =
                v_now,

            updated_at =
                v_now
        where
            q.company_uid =
                v_candidate.company_uid
            and q.brand_uid =
                v_candidate.brand_uid
            and q.store_uid =
                v_candidate.store_uid
            and q.tran_id =
                v_candidate.tran_id
        returning
            q.tran_id,
            q.claim_token,
            q.result_version,
            q.state_fingerprint,
            q.attempt_count
        into
            tran_id,
            claim_token,
            result_version,
            state_fingerprint,
            attempt_count;

        return next;
    end loop;

    return;
end;
$$;

-- ============================================================
-- RESOLVE CLAIM
--
-- Retry worker must own:
--   exact branch
--   exact transaction
--   exact current claim token
--   exact result_version
--   unexpired claim
--
-- A newer result_put invalidates both claim and version.
-- ============================================================

create or replace function
public.cing_kds_fabi_reconciliation_resolve_claim_v1(
    p_company_uid text,
    p_brand_uid text,
    p_store_uid text,
    p_tran_id text,
    p_claim_token uuid,
    p_expected_result_version bigint,
    p_status text,
    p_state_fingerprint text,
    p_retry_delay_seconds integer
)
returns table (
    reconciliation_status text,
    result_version bigint,
    attempt_count bigint,
    next_reconcile_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_now timestamptz;
    v_row public.cing_kds_fabi_reconciliation_queue_v1%rowtype;
    v_next timestamptz;
begin
    if p_company_uid is null
       or length(btrim(p_company_uid)) = 0
       or p_brand_uid is null
       or length(btrim(p_brand_uid)) = 0
       or p_store_uid is null
       or length(btrim(p_store_uid)) = 0
       or p_tran_id is null
       or length(btrim(p_tran_id)) = 0
       or p_claim_token is null
       or p_expected_result_version is null
       or p_expected_result_version < 1 then
        raise exception
            'CING_KDS_RECON_RESOLVE_IDENTITY_REQUIRED';
    end if;

    if p_status is null
       or p_status not in (
           'pending_c03',
           'ready',
           'review_required'
       ) then
        raise exception
            'CING_KDS_RECON_STATUS_INVALID';
    end if;

    if p_state_fingerprint is null
       or p_state_fingerprint !~ '^[a-f0-9]{64}$' then
        raise exception
            'CING_KDS_RECON_FINGERPRINT_INVALID';
    end if;

    if p_status = 'pending_c03' then
        if p_retry_delay_seconds is null
           or p_retry_delay_seconds < 1
           or p_retry_delay_seconds > 32400 then
            raise exception
                'CING_KDS_RECON_RETRY_DELAY_INVALID';
        end if;
    elsif p_retry_delay_seconds is not null then
        raise exception
            'CING_KDS_RECON_TERMINAL_RETRY_FORBIDDEN';
    end if;

    select *
    into v_row
    from
        public.cing_kds_fabi_reconciliation_queue_v1 q
    where
        q.company_uid = btrim(p_company_uid)
        and q.brand_uid = btrim(p_brand_uid)
        and q.store_uid = btrim(p_store_uid)
        and q.tran_id = btrim(p_tran_id)
    for update;

    if not found then
        raise exception
            'CING_KDS_RECON_ROW_MISSING';
    end if;

    v_now :=
        clock_timestamp();

    if v_row.claim_token is distinct from
       p_claim_token then
        raise exception
            'CING_KDS_RECON_CLAIM_FENCE_CONFLICT';
    end if;

    if v_row.claim_expires_at is null
       or v_row.claim_expires_at <= v_now then
        raise exception
            'CING_KDS_RECON_CLAIM_EXPIRED';
    end if;

    if v_row.result_version <>
       p_expected_result_version then
        raise exception
            'CING_KDS_RECON_RESULT_VERSION_CONFLICT';
    end if;

    v_next :=
        case
            when p_status = 'pending_c03'
            then v_now
                 + make_interval(
                     secs => p_retry_delay_seconds
                   )
            else null
        end;

    update
        public.cing_kds_fabi_reconciliation_queue_v1 q
    set
        reconciliation_status =
            p_status,

        state_fingerprint =
            p_state_fingerprint,

        result_version =
            q.result_version + 1,

        next_reconcile_at =
            v_next,

        claim_token =
            null,

        claim_expires_at =
            null,

        last_result_at =
            v_now,

        updated_at =
            v_now
    where
        q.company_uid = btrim(p_company_uid)
        and q.brand_uid = btrim(p_brand_uid)
        and q.store_uid = btrim(p_store_uid)
        and q.tran_id = btrim(p_tran_id)
    returning *
    into v_row;

    return query
    select
        v_row.reconciliation_status,
        v_row.result_version,
        v_row.attempt_count,
        v_row.next_reconcile_at;
end;
$$;

-- ============================================================
-- ACL
-- ============================================================

revoke all
on function
public.cing_kds_fabi_reconciliation_result_put_v1(
    text,
    text,
    text,
    text,
    text,
    text,
    integer
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_kds_fabi_reconciliation_result_put_v1(
    text,
    text,
    text,
    text,
    text,
    text,
    integer
)
to service_role;

revoke all
on function
public.cing_kds_fabi_reconciliation_claim_due_v1(
    text,
    text,
    text,
    integer,
    integer
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_kds_fabi_reconciliation_claim_due_v1(
    text,
    text,
    text,
    integer,
    integer
)
to service_role;

revoke all
on function
public.cing_kds_fabi_reconciliation_resolve_claim_v1(
    text,
    text,
    text,
    text,
    uuid,
    bigint,
    text,
    text,
    integer
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_kds_fabi_reconciliation_resolve_claim_v1(
    text,
    text,
    text,
    text,
    uuid,
    bigint,
    text,
    text,
    integer
)
to service_role;

comment on table
public.cing_kds_fabi_reconciliation_queue_v1
is
'Cing KDS FABi durable transaction-level C03 reconciliation queue. Preserves pending C03 transactions independently of the advancing C04 polling checkpoint. No payment/final authority.';

comment on function
public.cing_kds_fabi_reconciliation_resolve_claim_v1(
    text,
    text,
    text,
    text,
    uuid,
    bigint,
    text,
    text,
    integer
)
is
'Cing KDS token- and result-version-fenced reconciliation retry resolution. A stale retry cannot overwrite a newer C04 observation.';
