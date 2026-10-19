-- ============================================================
-- CING KDS PRO — FABi C04 EVENT INBOX V1
-- DORMANT / NORMALIZED EVENTS ONLY
-- NO PRODUCTION EXECUTION IN THIS BLOCK
-- ============================================================

begin;

create table if not exists public.cing_kds_fabi_c04_event_inbox (
    id bigint generated always as identity primary key,

    source text not null
        check (
            source = 'fabi_c04_sale_change_log'
        ),

    schema_version text not null
        check (
            schema_version = 'cing_kds_fabi_c04_event_v1'
        ),

    source_log_type text not null
        check (
            source_log_type in ('SALE_CHANGE', 'SALE_MERGE_ORDER')
        ),

    event_fingerprint text not null
        check (
            event_fingerprint ~ '^[a-f0-9]{64}$'
        ),

    tran_id text not null
        check (
            length(btrim(tran_id)) > 0
        ),

    tran_no text null,

    source_store_uid text null,
    source_brand_uid text null,
    source_company_uid text null,

    event_created_at numeric not null,
    event_updated_at numeric null,

    normalized_event jsonb not null,

    processing_state text not null
        default 'pending'
        check (
            processing_state in (
                'pending',
                'projected',
                'review_required'
            )
        ),

    review_reason text null,

    first_observed_at timestamptz not null
        default clock_timestamp(),

    last_observed_at timestamptz not null
        default clock_timestamp(),

    observation_count bigint not null
        default 1
        check (
            observation_count >= 1
        ),

    projected_at timestamptz null,

    created_at timestamptz not null
        default clock_timestamp(),

    updated_at timestamptz not null
        default clock_timestamp(),

    constraint cing_kds_fabi_c04_event_inbox_event_fingerprint_uk
        unique (event_fingerprint),

    constraint cing_kds_fabi_c04_event_inbox_normalized_object_ck
        check (
            jsonb_typeof(normalized_event) = 'object'
        ),

    constraint cing_kds_fabi_c04_event_inbox_no_payment_authority_ck
        check (
            coalesce(
                normalized_event #>> '{semantics,payment_authority}',
                'false'
            ) = 'false'
        ),

    constraint cing_kds_fabi_c04_event_inbox_no_final_authority_ck
        check (
            coalesce(
                normalized_event #>> '{semantics,final_state_authority}',
                'false'
            ) = 'false'
        ),

    constraint cing_kds_fabi_c04_event_inbox_signed_delta_ck
        check (
            normalized_event #>> '{semantics,quantity_model}'
            = 'signed_delta'
        )
);

create index if not exists
    cing_kds_fabi_c04_event_inbox_branch_tran_idx
on public.cing_kds_fabi_c04_event_inbox (
    source_company_uid,
    source_brand_uid,
    source_store_uid,
    tran_id,
    event_created_at,
    id
);

create index if not exists
    cing_kds_fabi_c04_event_inbox_state_idx
on public.cing_kds_fabi_c04_event_inbox (
    processing_state,
    event_created_at,
    id
);

alter table
    public.cing_kds_fabi_c04_event_inbox
enable row level security;

revoke all
on table
    public.cing_kds_fabi_c04_event_inbox
from public;

revoke all
on table
    public.cing_kds_fabi_c04_event_inbox
from anon;

revoke all
on table
    public.cing_kds_fabi_c04_event_inbox
from authenticated;

-- ------------------------------------------------------------
-- Private idempotent persistence function.
--
-- Exact replay:
--   same event_fingerprint + same normalized_event
--   => observation_count increments
--
-- Fingerprint collision / changed content:
--   => fail closed by returning conflict
--   => original normalized payload is never overwritten
--
-- This function does NOT verify payment.
-- This function does NOT mark invoice final.
-- ------------------------------------------------------------

create or replace function public.cing_kds_fabi_c04_event_inbox_put_v1(
    p_source text,
    p_schema_version text,
    p_source_log_type text,
    p_event_fingerprint text,
    p_tran_id text,
    p_tran_no text,
    p_source_store_uid text,
    p_source_brand_uid text,
    p_source_company_uid text,
    p_event_created_at numeric,
    p_event_updated_at numeric,
    p_normalized_event jsonb
)
returns table (
    result text,
    inbox_id bigint,
    observation_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_existing public.cing_kds_fabi_c04_event_inbox%rowtype;
    v_inserted public.cing_kds_fabi_c04_event_inbox%rowtype;
begin
    if p_source is distinct from 'fabi_c04_sale_change_log' then
        raise exception 'C04_INBOX_INVALID_SOURCE';
    end if;

    if p_schema_version is distinct from 'cing_kds_fabi_c04_event_v1' then
        raise exception 'C04_INBOX_INVALID_SCHEMA';
    end if;

    if p_source_log_type is null
       or p_source_log_type not in ('SALE_CHANGE', 'SALE_MERGE_ORDER') then
        raise exception 'C04_INBOX_INVALID_LOG_TYPE';
    end if;

    if p_event_fingerprint is null
       or p_event_fingerprint !~ '^[a-f0-9]{64}$' then
        raise exception 'C04_INBOX_INVALID_FINGERPRINT';
    end if;

    if p_tran_id is null
       or length(btrim(p_tran_id)) = 0 then
        raise exception 'C04_INBOX_INVALID_TRAN_ID';
    end if;

    if p_event_created_at is null then
        raise exception 'C04_INBOX_INVALID_EVENT_TIME';
    end if;

    if p_normalized_event is null
       or jsonb_typeof(p_normalized_event) <> 'object' then
        raise exception 'C04_INBOX_INVALID_EVENT';
    end if;

    if coalesce(
        p_normalized_event #>> '{semantics,payment_authority}',
        'false'
    ) <> 'false' then
        raise exception 'C04_INBOX_PAYMENT_AUTHORITY_FORBIDDEN';
    end if;

    if coalesce(
        p_normalized_event #>> '{semantics,final_state_authority}',
        'false'
    ) <> 'false' then
        raise exception 'C04_INBOX_FINAL_AUTHORITY_FORBIDDEN';
    end if;

    if p_normalized_event #>> '{semantics,quantity_model}'
       is distinct from 'signed_delta' then
        raise exception 'C04_INBOX_SIGNED_DELTA_REQUIRED';
    end if;

    -- --------------------------------------------------------
    -- Concurrency-safe first-write path.
    --
    -- Two workers may observe the same brand-new fingerprint
    -- concurrently. INSERT ... ON CONFLICT DO NOTHING ensures
    -- exactly one creates the durable row. The loser then locks
    -- and classifies the existing row as duplicate or conflict.
    -- --------------------------------------------------------

    insert into public.cing_kds_fabi_c04_event_inbox (
        source,
        schema_version,
        source_log_type,
        event_fingerprint,
        tran_id,
        tran_no,
        source_store_uid,
        source_brand_uid,
        source_company_uid,
        event_created_at,
        event_updated_at,
        normalized_event
    )
    values (
        p_source,
        p_schema_version,
        p_source_log_type,
        p_event_fingerprint,
        p_tran_id,
        nullif(btrim(p_tran_no), ''),
        nullif(btrim(p_source_store_uid), ''),
        nullif(btrim(p_source_brand_uid), ''),
        nullif(btrim(p_source_company_uid), ''),
        p_event_created_at,
        p_event_updated_at,
        p_normalized_event
    )
    on conflict (event_fingerprint)
    do nothing
    returning *
    into v_inserted;

    if found then
        return query
        select
            'inserted'::text,
            v_inserted.id,
            v_inserted.observation_count;

        return;
    end if;

    -- A row now exists. This also waits for a concurrent
    -- first-insert transaction to finish before classification.
    select *
    into v_existing
    from public.cing_kds_fabi_c04_event_inbox
    where event_fingerprint = p_event_fingerprint
    for update;

    if not found then
        raise exception 'C04_INBOX_CONFLICT_ROW_MISSING';
    end if;

    if v_existing.source is distinct from p_source
       or v_existing.schema_version is distinct from p_schema_version
       or v_existing.source_log_type is distinct from p_source_log_type
       or v_existing.tran_id is distinct from p_tran_id
       or v_existing.normalized_event is distinct from p_normalized_event then

        return query
        select
            'conflict'::text,
            v_existing.id,
            v_existing.observation_count;

        return;
    end if;

    update public.cing_kds_fabi_c04_event_inbox
    set
        observation_count = observation_count + 1,
        last_observed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = v_existing.id
    returning *
    into v_existing;

    return query
    select
        'duplicate'::text,
        v_existing.id,
        v_existing.observation_count;

    return;
end;
$$;

revoke all
on function public.cing_kds_fabi_c04_event_inbox_put_v1(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    numeric,
    numeric,
    jsonb
)
from public;

revoke all
on function public.cing_kds_fabi_c04_event_inbox_put_v1(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    numeric,
    numeric,
    jsonb
)
from anon;

revoke all
on function public.cing_kds_fabi_c04_event_inbox_put_v1(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    numeric,
    numeric,
    jsonb
)
from authenticated;

comment on table public.cing_kds_fabi_c04_event_inbox is
'Cing KDS dormant durable inbox for normalized FABi C04 SALE_CHANGE and SALE_MERGE_ORDER signed-delta events. No payment or final-state authority.';

comment on function public.cing_kds_fabi_c04_event_inbox_put_v1(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    numeric,
    numeric,
    jsonb
) is
'Private idempotent persistence for normalized C04 events. Exact replay increments observation count; conflicting same fingerprint never overwrites original.';

commit;

-- ============================================================
-- CING KDS FABi C04 — BACKEND DURABLE RUNTIME BOUNDARY V1
--
-- Backend service_role receives RPC execution only.
-- It receives NO direct table authority.
--
-- WRITE:
--   cing_kds_fabi_c04_event_inbox_put_v1(...)
--
-- READ:
--   cing_kds_fabi_c04_event_inbox_load_tran_v1(text, text, text, text)
--
-- The read boundary exposes normalized durable events only.
-- It does NOT verify payment and does NOT mark an invoice final.
-- ============================================================

revoke all
on table public.cing_kds_fabi_c04_event_inbox
from service_role;

revoke all
on function public.cing_kds_fabi_c04_event_inbox_put_v1(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    numeric,
    numeric,
    jsonb
)
from service_role;

grant execute
on function public.cing_kds_fabi_c04_event_inbox_put_v1(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    numeric,
    numeric,
    jsonb
)
to service_role;

create or replace function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
    p_company_uid text,
    p_brand_uid text,
    p_store_uid text,
    p_tran_id text
)
returns table (
    inbox_id bigint,
    event_created_at numeric,
    normalized_event jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if p_company_uid is null
       or length(btrim(p_company_uid)) = 0
       or p_brand_uid is null
       or length(btrim(p_brand_uid)) = 0
       or p_store_uid is null
       or length(btrim(p_store_uid)) = 0 then
        raise exception 'C04_INBOX_LOAD_SCOPE_REQUIRED';
    end if;

    if p_tran_id is null
       or length(btrim(p_tran_id)) = 0 then
        raise exception 'C04_INBOX_LOAD_TRAN_ID_REQUIRED';
    end if;

    return query
    select
        i.id,
        i.event_created_at,
        i.normalized_event
    from public.cing_kds_fabi_c04_event_inbox i
    where i.source_company_uid = btrim(p_company_uid)
      and i.source_brand_uid = btrim(p_brand_uid)
      and i.source_store_uid = btrim(p_store_uid)
      and i.tran_id = btrim(p_tran_id)
    order by
        i.event_created_at asc,
        i.id asc;
end;
$$;

revoke all
on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
    text,
    text,
    text,
    text
)
from public;

revoke all
on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
    text,
    text,
    text,
    text
)
from anon;

revoke all
on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
    text,
    text,
    text,
    text
)
from authenticated;

revoke all
on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
    text,
    text,
    text,
    text
)
from service_role;

grant execute
on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
    text,
    text,
    text,
    text
)
to service_role;

comment on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
    text,
    text,
    text,
    text
) is
'Cing KDS backend-only branch-scoped durable C04 transaction history loader. Exact company/brand/store/tran identity required. Returns normalized signed-delta events only; no payment or final-state authority.';
