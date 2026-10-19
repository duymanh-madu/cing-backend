-- ============================================================
-- CING KDS FABi RUNTIME FENCING V1
--
-- DORMANT / NOT APPLIED BY THIS BLOCK.
--
-- One correctness authority row exists per exact FABi branch:
--
--   company_uid + brand_uid + store_uid
--
-- The row owns:
--
--   durable successful checkpoint_end_ms
--   current worker lease token
--   lease expiry
--
-- IMPORTANT:
--
-- checkpoint_end_ms is scheduling/recovery metadata only.
-- It is NOT source completeness authority.
--
-- Every poll replays an overlap window.
-- C04 durable event fingerprint remains idempotency authority.
--
-- A stale worker may have already persisted safe idempotent
-- inbox events, but MUST NOT advance the checkpoint after
-- another worker has acquired a newer lease.
-- ============================================================

create table if not exists
public.cing_kds_fabi_runtime_branch_v1 (
    company_uid text not null
        check (length(btrim(company_uid)) > 0),

    brand_uid text not null
        check (length(btrim(brand_uid)) > 0),

    store_uid text not null
        check (length(btrim(store_uid)) > 0),

    checkpoint_end_ms bigint null
        check (
            checkpoint_end_ms is null
            or checkpoint_end_ms >= 0
        ),

    last_success_at timestamptz null,

    lease_token uuid null,
    lease_expires_at timestamptz null,

    created_at timestamptz not null
        default clock_timestamp(),

    updated_at timestamptz not null
        default clock_timestamp(),

    primary key (
        company_uid,
        brand_uid,
        store_uid
    ),

    constraint cing_kds_fabi_runtime_lease_pair_ck
        check (
            (
                lease_token is null
                and lease_expires_at is null
            )
            or
            (
                lease_token is not null
                and lease_expires_at is not null
            )
        )
);

alter table
    public.cing_kds_fabi_runtime_branch_v1
enable row level security;

revoke all
on table public.cing_kds_fabi_runtime_branch_v1
from public;

revoke all
on table public.cing_kds_fabi_runtime_branch_v1
from anon;

revoke all
on table public.cing_kds_fabi_runtime_branch_v1
from authenticated;

revoke all
on table public.cing_kds_fabi_runtime_branch_v1
from service_role;

-- ============================================================
-- ACQUIRE
--
-- Atomic branch lease.
--
-- If another unexpired worker owns the branch:
--   acquired = false
--
-- No foreign lease token is exposed.
--
-- An expired lease can be reclaimed with a fresh UUID.
-- ============================================================

create or replace function
public.cing_kds_fabi_runtime_lease_acquire_v1(
    p_company_uid text,
    p_brand_uid text,
    p_store_uid text,
    p_lease_seconds integer
)
returns table (
    acquired boolean,
    lease_token uuid,
    lease_expires_at timestamptz,
    checkpoint_end_ms bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row
        public.cing_kds_fabi_runtime_branch_v1%rowtype;

    v_now timestamptz;
    v_token uuid;
begin
    if p_company_uid is null
       or length(btrim(p_company_uid)) = 0
       or p_brand_uid is null
       or length(btrim(p_brand_uid)) = 0
       or p_store_uid is null
       or length(btrim(p_store_uid)) = 0 then
        raise exception
            'CING_KDS_RUNTIME_SCOPE_REQUIRED';
    end if;

    if p_lease_seconds is null
       or p_lease_seconds < 30
       or p_lease_seconds > 900 then
        raise exception
            'CING_KDS_RUNTIME_LEASE_SECONDS_INVALID';
    end if;

    insert into
        public.cing_kds_fabi_runtime_branch_v1 (
            company_uid,
            brand_uid,
            store_uid
        )
    values (
        btrim(p_company_uid),
        btrim(p_brand_uid),
        btrim(p_store_uid)
    )
    on conflict (
        company_uid,
        brand_uid,
        store_uid
    )
    do nothing;

    select *
    into v_row
    from public.cing_kds_fabi_runtime_branch_v1
    where company_uid = btrim(p_company_uid)
      and brand_uid = btrim(p_brand_uid)
      and store_uid = btrim(p_store_uid)
    for update;

    if not found then
        raise exception
            'CING_KDS_RUNTIME_BRANCH_ROW_MISSING';
    end if;

    v_now :=
        clock_timestamp();

    if v_row.lease_token is not null
       and v_row.lease_expires_at is not null
       and v_row.lease_expires_at > v_now then

        return query
        select
            false,
            null::uuid,
            v_row.lease_expires_at,
            v_row.checkpoint_end_ms;

        return;
    end if;

    v_token :=
        gen_random_uuid();

    update
        public.cing_kds_fabi_runtime_branch_v1
    set
        lease_token =
            v_token,

        lease_expires_at =
            v_now
            + make_interval(
                secs => p_lease_seconds
            ),

        updated_at =
            v_now
    where company_uid =
            btrim(p_company_uid)
      and brand_uid =
            btrim(p_brand_uid)
      and store_uid =
            btrim(p_store_uid)
    returning *
    into v_row;

    return query
    select
        true,
        v_row.lease_token,
        v_row.lease_expires_at,
        v_row.checkpoint_end_ms;
end;
$$;

-- ============================================================
-- SUCCESS COMMIT
--
-- Atomically:
--   verify current lease token
--   verify lease has not expired
--   reject checkpoint regression
--   commit successful checkpoint
--   release lease
--
-- This is the fencing boundary.
-- ============================================================

create or replace function
public.cing_kds_fabi_runtime_checkpoint_commit_v1(
    p_company_uid text,
    p_brand_uid text,
    p_store_uid text,
    p_lease_token uuid,
    p_checkpoint_end_ms bigint
)
returns table (
    committed boolean,
    checkpoint_end_ms bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row
        public.cing_kds_fabi_runtime_branch_v1%rowtype;

    v_now timestamptz;
begin
    if p_company_uid is null
       or length(btrim(p_company_uid)) = 0
       or p_brand_uid is null
       or length(btrim(p_brand_uid)) = 0
       or p_store_uid is null
       or length(btrim(p_store_uid)) = 0
       or p_lease_token is null then
        raise exception
            'CING_KDS_RUNTIME_COMMIT_IDENTITY_REQUIRED';
    end if;

    if p_checkpoint_end_ms is null
       or p_checkpoint_end_ms < 0 then
        raise exception
            'CING_KDS_RUNTIME_CHECKPOINT_INVALID';
    end if;

    select *
    into v_row
    from public.cing_kds_fabi_runtime_branch_v1
    where company_uid = btrim(p_company_uid)
      and brand_uid = btrim(p_brand_uid)
      and store_uid = btrim(p_store_uid)
    for update;

    if not found then
        raise exception
            'CING_KDS_RUNTIME_BRANCH_ROW_MISSING';
    end if;

    v_now :=
        clock_timestamp();

    if v_row.lease_token is distinct from
       p_lease_token then
        raise exception
            'CING_KDS_RUNTIME_LEASE_FENCE_CONFLICT';
    end if;

    if v_row.lease_expires_at is null
       or v_row.lease_expires_at <= v_now then
        raise exception
            'CING_KDS_RUNTIME_LEASE_EXPIRED';
    end if;

    if v_row.checkpoint_end_ms is not null
       and p_checkpoint_end_ms <
           v_row.checkpoint_end_ms then
        raise exception
            'CING_KDS_RUNTIME_CHECKPOINT_REGRESSION';
    end if;

    update
        public.cing_kds_fabi_runtime_branch_v1
    set
        checkpoint_end_ms =
            p_checkpoint_end_ms,

        last_success_at =
            v_now,

        lease_token =
            null,

        lease_expires_at =
            null,

        updated_at =
            v_now
    where company_uid =
            btrim(p_company_uid)
      and brand_uid =
            btrim(p_brand_uid)
      and store_uid =
            btrim(p_store_uid);

    return query
    select
        true,
        p_checkpoint_end_ms;
end;
$$;

-- ============================================================
-- RENEW
--
-- The current, still-live token may extend its own lease.
--
-- An expired token is NEVER revived: it must reacquire with a
-- fresh token.  This preserves the fencing boundary while a
-- bounded one-shot run performs sequential durable work.
-- ============================================================

create or replace function
public.cing_kds_fabi_runtime_lease_renew_v1(
    p_company_uid text,
    p_brand_uid text,
    p_store_uid text,
    p_lease_token uuid,
    p_lease_seconds integer
)
returns table (
    renewed boolean,
    lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row
        public.cing_kds_fabi_runtime_branch_v1%rowtype;

    v_now timestamptz;
begin
    if p_company_uid is null
       or length(btrim(p_company_uid)) = 0
       or p_brand_uid is null
       or length(btrim(p_brand_uid)) = 0
       or p_store_uid is null
       or length(btrim(p_store_uid)) = 0
       or p_lease_token is null then
        raise exception
            'CING_KDS_RUNTIME_RENEW_IDENTITY_REQUIRED';
    end if;

    if p_lease_seconds is null
       or p_lease_seconds < 30
       or p_lease_seconds > 900 then
        raise exception
            'CING_KDS_RUNTIME_LEASE_SECONDS_INVALID';
    end if;

    select *
    into v_row
    from public.cing_kds_fabi_runtime_branch_v1
    where company_uid = btrim(p_company_uid)
      and brand_uid = btrim(p_brand_uid)
      and store_uid = btrim(p_store_uid)
    for update;

    if not found then
        raise exception
            'CING_KDS_RUNTIME_BRANCH_ROW_MISSING';
    end if;

    v_now :=
        clock_timestamp();

    if v_row.lease_token is distinct from p_lease_token
       or v_row.lease_expires_at is null
       or v_row.lease_expires_at <= v_now then
        return query
        select
            false,
            null::timestamptz;

        return;
    end if;

    update
        public.cing_kds_fabi_runtime_branch_v1
    set
        lease_expires_at =
            v_now
            + make_interval(
                secs => p_lease_seconds
            ),

        updated_at =
            v_now
    where company_uid = btrim(p_company_uid)
      and brand_uid = btrim(p_brand_uid)
      and store_uid = btrim(p_store_uid)
      and lease_token = p_lease_token
    returning *
    into v_row;

    return query
    select
        true,
        v_row.lease_expires_at;
end;
$$;

-- ============================================================
-- FAILURE / EARLY RELEASE
--
-- Only the current token can clear the lease.
--
-- A stale worker receives released=false and cannot clear
-- a newer worker's lease.
-- ============================================================

create or replace function
public.cing_kds_fabi_runtime_lease_release_v1(
    p_company_uid text,
    p_brand_uid text,
    p_store_uid text,
    p_lease_token uuid
)
returns table (
    released boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer;
begin
    if p_company_uid is null
       or length(btrim(p_company_uid)) = 0
       or p_brand_uid is null
       or length(btrim(p_brand_uid)) = 0
       or p_store_uid is null
       or length(btrim(p_store_uid)) = 0
       or p_lease_token is null then
        raise exception
            'CING_KDS_RUNTIME_RELEASE_IDENTITY_REQUIRED';
    end if;

    update
        public.cing_kds_fabi_runtime_branch_v1
    set
        lease_token =
            null,

        lease_expires_at =
            null,

        updated_at =
            clock_timestamp()
    where company_uid =
            btrim(p_company_uid)
      and brand_uid =
            btrim(p_brand_uid)
      and store_uid =
            btrim(p_store_uid)
      and lease_token =
            p_lease_token;

    get diagnostics
        v_count =
            row_count;

    return query
    select
        v_count = 1;
end;
$$;

-- ============================================================
-- ACL
-- ============================================================

revoke all
on function
public.cing_kds_fabi_runtime_lease_acquire_v1(
    text,
    text,
    text,
    integer
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_kds_fabi_runtime_lease_acquire_v1(
    text,
    text,
    text,
    integer
)
to service_role;

revoke all
on function
public.cing_kds_fabi_runtime_checkpoint_commit_v1(
    text,
    text,
    text,
    uuid,
    bigint
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_kds_fabi_runtime_checkpoint_commit_v1(
    text,
    text,
    text,
    uuid,
    bigint
)
to service_role;

revoke all
on function
public.cing_kds_fabi_runtime_lease_renew_v1(
    text,
    text,
    text,
    uuid,
    integer
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_kds_fabi_runtime_lease_renew_v1(
    text,
    text,
    text,
    uuid,
    integer
)
to service_role;

revoke all
on function
public.cing_kds_fabi_runtime_lease_release_v1(
    text,
    text,
    text,
    uuid
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_kds_fabi_runtime_lease_release_v1(
    text,
    text,
    text,
    uuid
)
to service_role;

comment on table
public.cing_kds_fabi_runtime_branch_v1
is
'Cing KDS FABi per-branch durable scheduling checkpoint and fenced worker lease. checkpoint_end_ms is scheduling metadata only, never source completeness/payment/final authority.';

comment on function
public.cing_kds_fabi_runtime_checkpoint_commit_v1(
    text,
    text,
    text,
    uuid,
    bigint
)
is
'Cing KDS fenced successful poll checkpoint commit. Current unexpired lease token required; stale workers cannot advance checkpoint.';
