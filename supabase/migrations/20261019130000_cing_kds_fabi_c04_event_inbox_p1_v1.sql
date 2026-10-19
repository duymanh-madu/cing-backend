-- ============================================================
-- CING KDS Pro — Recovery R3 / P1 C04 Durable Inbox V1
-- SOURCE REVIEW ONLY. DO NOT EXECUTE WITHOUT A NEW EXPLICIT
-- PRODUCTION AUTHORIZATION AND CHECKSUM RECORD.
--
-- P1 creates raw normalized C04 durable storage only. It grants
-- no table or function authority to any application role.
-- ============================================================

begin;

do $$
declare
  v_adoption_count integer;
  v_preflight_sha256 text;
begin
  if to_regclass('public.cing_kds_production_adoption_v1') is null then
    raise exception 'KDS_P1_P0_ADOPTION_RECORD_MISSING';
  end if;

  select count(*), min(preflight_sha256)
    into v_adoption_count, v_preflight_sha256
    from public.cing_kds_production_adoption_v1
   where adoption_key = 'kds_r2_contained_draft_baseline_v1';

  if v_adoption_count <> 1 then
    raise exception 'KDS_P1_P0_ADOPTION_RECORD_INVALID';
  end if;

  if v_preflight_sha256 is distinct from
     '03f49bd10dbd7f41b7c234bf2914e635217443fe2e65ce7e721287b6c56c45b6' then
    raise exception 'KDS_P1_P0_PREFLIGHT_HASH_MISMATCH';
  end if;

  if to_regclass('public.cing_kds_fabi_c04_event_inbox') is not null
     or to_regclass('public.cing_kds_fabi_c04_event_inbox_branch_tran_idx') is not null
     or to_regclass('public.cing_kds_fabi_c04_event_inbox_state_idx') is not null then
    raise exception 'KDS_P1_C04_RELATION_ALREADY_PRESENT';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'cing_kds_fabi_c04_event_inbox_put_v1',
         'cing_kds_fabi_c04_event_inbox_load_tran_v1'
       )
  ) then
    raise exception 'KDS_P1_C04_FUNCTION_ALREADY_PRESENT';
  end if;
end;
$$;

create table public.cing_kds_fabi_c04_event_inbox (
  id bigint generated always as identity primary key,
  source text not null check (source = 'fabi_c04_sale_change_log'),
  schema_version text not null check (schema_version = 'cing_kds_fabi_c04_event_v1'),
  source_log_type text not null check (source_log_type in ('SALE_CHANGE', 'SALE_MERGE_ORDER')),
  event_fingerprint text not null check (event_fingerprint ~ '^[a-f0-9]{64}$'),
  tran_id text not null check (length(btrim(tran_id)) > 0),
  tran_no text null,
  source_store_uid text not null check (length(btrim(source_store_uid)) > 0),
  source_brand_uid text not null check (length(btrim(source_brand_uid)) > 0),
  source_company_uid text not null check (length(btrim(source_company_uid)) > 0),
  event_created_at numeric not null check (event_created_at <> 'NaN'::numeric),
  event_updated_at numeric null check (event_updated_at is null or event_updated_at <> 'NaN'::numeric),
  normalized_event jsonb not null,
  processing_state text not null default 'pending'
    check (processing_state in ('pending', 'projected', 'review_required')),
  review_reason text null,
  first_observed_at timestamptz not null default clock_timestamp(),
  last_observed_at timestamptz not null default clock_timestamp(),
  observation_count bigint not null default 1 check (observation_count >= 1),
  projected_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint cing_kds_fabi_c04_event_inbox_event_fingerprint_uk unique (event_fingerprint),
  constraint cing_kds_fabi_c04_event_inbox_normalized_object_ck
    check (jsonb_typeof(normalized_event) = 'object'),
  constraint cing_kds_fabi_c04_event_inbox_lines_ck
    check (jsonb_typeof(normalized_event -> 'lines') = 'array'
       and jsonb_array_length(normalized_event -> 'lines') > 0),
  constraint cing_kds_fabi_c04_event_inbox_no_payment_authority_ck
    check (normalized_event #>> '{semantics,payment_authority}' = 'false'),
  constraint cing_kds_fabi_c04_event_inbox_no_final_authority_ck
    check (normalized_event #>> '{semantics,final_state_authority}' = 'false'),
  constraint cing_kds_fabi_c04_event_inbox_signed_delta_ck
    check (normalized_event #>> '{semantics,quantity_model}' = 'signed_delta')
);

create index cing_kds_fabi_c04_event_inbox_branch_tran_idx
  on public.cing_kds_fabi_c04_event_inbox (
    source_company_uid, source_brand_uid, source_store_uid, tran_id, event_created_at, id
  );

create index cing_kds_fabi_c04_event_inbox_state_idx
  on public.cing_kds_fabi_c04_event_inbox (processing_state, event_created_at, id);

alter table public.cing_kds_fabi_c04_event_inbox enable row level security;

revoke all on table public.cing_kds_fabi_c04_event_inbox
from public, anon, authenticated, service_role;

create function public.cing_kds_fabi_c04_event_inbox_put_v1(
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
returns table (result text, inbox_id bigint, observation_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.cing_kds_fabi_c04_event_inbox%rowtype;
  v_inserted public.cing_kds_fabi_c04_event_inbox%rowtype;
  v_tran_id text;
  v_tran_no text;
  v_store_uid text;
  v_brand_uid text;
  v_company_uid text;
begin
  if p_source is distinct from 'fabi_c04_sale_change_log' then
    raise exception 'C04_INBOX_INVALID_SOURCE';
  end if;
  if p_schema_version is distinct from 'cing_kds_fabi_c04_event_v1' then
    raise exception 'C04_INBOX_INVALID_SCHEMA';
  end if;
  if p_source_log_type is null or p_source_log_type not in ('SALE_CHANGE', 'SALE_MERGE_ORDER') then
    raise exception 'C04_INBOX_INVALID_LOG_TYPE';
  end if;
  if p_event_fingerprint is null or p_event_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'C04_INBOX_INVALID_FINGERPRINT';
  end if;
  if p_event_created_at is null or p_event_created_at = 'NaN'::numeric then
    raise exception 'C04_INBOX_INVALID_EVENT_TIME';
  end if;
  if p_event_updated_at = 'NaN'::numeric then
    raise exception 'C04_INBOX_INVALID_UPDATED_TIME';
  end if;
  if p_normalized_event is null or jsonb_typeof(p_normalized_event) <> 'object' then
    raise exception 'C04_INBOX_INVALID_EVENT';
  end if;
  if jsonb_typeof(p_normalized_event -> 'lines') <> 'array'
     or jsonb_array_length(p_normalized_event -> 'lines') = 0 then
    raise exception 'C04_INBOX_LINES_REQUIRED';
  end if;
  if p_normalized_event #>> '{semantics,payment_authority}' is distinct from 'false' then
    raise exception 'C04_INBOX_PAYMENT_AUTHORITY_FORBIDDEN';
  end if;
  if p_normalized_event #>> '{semantics,final_state_authority}' is distinct from 'false' then
    raise exception 'C04_INBOX_FINAL_AUTHORITY_FORBIDDEN';
  end if;
  if p_normalized_event #>> '{semantics,quantity_model}' is distinct from 'signed_delta' then
    raise exception 'C04_INBOX_SIGNED_DELTA_REQUIRED';
  end if;

  v_tran_id := nullif(btrim(p_tran_id), '');
  v_tran_no := nullif(btrim(p_tran_no), '');
  v_store_uid := nullif(btrim(p_source_store_uid), '');
  v_brand_uid := nullif(btrim(p_source_brand_uid), '');
  v_company_uid := nullif(btrim(p_source_company_uid), '');
  if v_tran_id is null then raise exception 'C04_INBOX_INVALID_TRAN_ID'; end if;
  if v_store_uid is null or v_brand_uid is null or v_company_uid is null then
    raise exception 'C04_INBOX_SCOPE_REQUIRED';
  end if;
  if p_normalized_event #>> '{tran_id}' is distinct from v_tran_id
     or p_normalized_event #>> '{source_store_uid}' is distinct from v_store_uid
     or p_normalized_event #>> '{source_brand_uid}' is distinct from v_brand_uid
     or p_normalized_event #>> '{source_company_uid}' is distinct from v_company_uid then
    raise exception 'C04_INBOX_EVENT_SCOPE_MISMATCH';
  end if;

  insert into public.cing_kds_fabi_c04_event_inbox (
    source, schema_version, source_log_type, event_fingerprint, tran_id, tran_no,
    source_store_uid, source_brand_uid, source_company_uid, event_created_at,
    event_updated_at, normalized_event
  ) values (
    p_source, p_schema_version, p_source_log_type, p_event_fingerprint, v_tran_id, v_tran_no,
    v_store_uid, v_brand_uid, v_company_uid, p_event_created_at, p_event_updated_at,
    p_normalized_event
  ) on conflict (event_fingerprint) do nothing
  returning * into v_inserted;

  if found then
    return query select 'inserted'::text, v_inserted.id, v_inserted.observation_count;
    return;
  end if;

  select * into v_existing
    from public.cing_kds_fabi_c04_event_inbox
   where event_fingerprint = p_event_fingerprint
   for update;
  if not found then
    raise exception 'C04_INBOX_CONFLICT_ROW_MISSING';
  end if;

  if v_existing.source is distinct from p_source
     or v_existing.schema_version is distinct from p_schema_version
     or v_existing.source_log_type is distinct from p_source_log_type
     or v_existing.tran_id is distinct from v_tran_id
     or v_existing.tran_no is distinct from v_tran_no
     or v_existing.source_store_uid is distinct from v_store_uid
     or v_existing.source_brand_uid is distinct from v_brand_uid
     or v_existing.source_company_uid is distinct from v_company_uid
     or v_existing.event_created_at is distinct from p_event_created_at
     or v_existing.event_updated_at is distinct from p_event_updated_at
     or v_existing.normalized_event is distinct from p_normalized_event then
    return query select 'conflict'::text, v_existing.id, v_existing.observation_count;
    return;
  end if;

  update public.cing_kds_fabi_c04_event_inbox
     set observation_count = observation_count + 1,
         last_observed_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where id = v_existing.id
  returning * into v_existing;
  return query select 'duplicate'::text, v_existing.id, v_existing.observation_count;
end;
$$;

create function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
  p_company_uid text,
  p_brand_uid text,
  p_store_uid text,
  p_tran_id text
)
returns table (inbox_id bigint, event_created_at numeric, normalized_event jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_uid text := nullif(btrim(p_company_uid), '');
  v_brand_uid text := nullif(btrim(p_brand_uid), '');
  v_store_uid text := nullif(btrim(p_store_uid), '');
  v_tran_id text := nullif(btrim(p_tran_id), '');
begin
  if v_company_uid is null or v_brand_uid is null or v_store_uid is null then
    raise exception 'C04_INBOX_LOAD_SCOPE_REQUIRED';
  end if;
  if v_tran_id is null then
    raise exception 'C04_INBOX_LOAD_TRAN_ID_REQUIRED';
  end if;
  return query
    select i.id, i.event_created_at, i.normalized_event
      from public.cing_kds_fabi_c04_event_inbox i
     where i.source_company_uid = v_company_uid
       and i.source_brand_uid = v_brand_uid
       and i.source_store_uid = v_store_uid
       and i.tran_id = v_tran_id
     order by i.event_created_at asc, i.id asc;
end;
$$;

revoke all on function public.cing_kds_fabi_c04_event_inbox_put_v1(
  text, text, text, text, text, text, text, text, text, numeric, numeric, jsonb
) from public, anon, authenticated, service_role;

revoke all on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(
  text, text, text, text
) from public, anon, authenticated, service_role;

comment on table public.cing_kds_fabi_c04_event_inbox is
'Cing KDS P1 private durable inbox for normalized FABi C04 signed-delta events; no payment or final-state authority.';

commit;
