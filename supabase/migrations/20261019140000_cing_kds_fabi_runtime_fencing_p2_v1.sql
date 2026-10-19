-- ============================================================
-- CING KDS Pro — Recovery R3 / P2 Runtime Fencing V1
-- SOURCE REVIEW ONLY. DO NOT EXECUTE WITHOUT A NEW EXPLICIT
-- PRODUCTION AUTHORIZATION AND CHECKSUM RECORD.
--
-- Checkpoint is recovery scheduling metadata only. It is never
-- payment, source-completeness, invoice-finality, item, or cup authority.
-- ============================================================

begin;

do $$
declare
  v_adoption_count integer;
  v_preflight_sha256 text;
  v_rls_enabled boolean;
  v_function_count integer;
begin
  if to_regclass('public.cing_kds_production_adoption_v1') is null then
    raise exception 'KDS_P2_P0_ADOPTION_RECORD_MISSING';
  end if;
  select count(*), min(preflight_sha256)
    into v_adoption_count, v_preflight_sha256
    from public.cing_kds_production_adoption_v1
   where adoption_key = 'kds_r2_contained_draft_baseline_v1';
  if v_adoption_count <> 1 then
    raise exception 'KDS_P2_P0_ADOPTION_RECORD_INVALID';
  end if;
  if v_preflight_sha256 is distinct from
     '03f49bd10dbd7f41b7c234bf2914e635217443fe2e65ce7e721287b6c56c45b6' then
    raise exception 'KDS_P2_P0_PREFLIGHT_HASH_MISMATCH';
  end if;

  if to_regclass('public.cing_kds_fabi_c04_event_inbox') is null then
    raise exception 'KDS_P2_P1_C04_TABLE_MISSING';
  end if;
  select c.relrowsecurity into v_rls_enabled
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'cing_kds_fabi_c04_event_inbox';
  if v_rls_enabled is distinct from true
     or has_table_privilege('anon', 'public.cing_kds_fabi_c04_event_inbox', 'select')
     or has_table_privilege('authenticated', 'public.cing_kds_fabi_c04_event_inbox', 'select')
     or has_table_privilege('service_role', 'public.cing_kds_fabi_c04_event_inbox', 'select') then
    raise exception 'KDS_P2_P1_C04_TABLE_DRIFT';
  end if;
  select count(*) into v_function_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('cing_kds_fabi_c04_event_inbox_put_v1', 'cing_kds_fabi_c04_event_inbox_load_tran_v1');
  if v_function_count <> 2 then
    raise exception 'KDS_P2_P1_C04_FUNCTION_DRIFT';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('cing_kds_fabi_c04_event_inbox_put_v1', 'cing_kds_fabi_c04_event_inbox_load_tran_v1')
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('service_role', p.oid, 'execute'))
  ) then
    raise exception 'KDS_P2_P1_C04_FUNCTION_GRANT_DRIFT';
  end if;

  if to_regclass('public.cing_kds_fabi_runtime_branch_v1') is not null then
    raise exception 'KDS_P2_RUNTIME_RELATION_ALREADY_PRESENT';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'cing_kds_fabi_runtime_lease_acquire_v1',
         'cing_kds_fabi_runtime_checkpoint_commit_v1',
         'cing_kds_fabi_runtime_lease_renew_v1',
         'cing_kds_fabi_runtime_lease_release_v1'
       )
  ) then
    raise exception 'KDS_P2_RUNTIME_FUNCTION_ALREADY_PRESENT';
  end if;
  if to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception 'KDS_P2_UUID_GENERATOR_MISSING';
  end if;
end;
$$;

create table public.cing_kds_fabi_runtime_branch_v1 (
  company_uid text not null check (length(btrim(company_uid)) > 0),
  brand_uid text not null check (length(btrim(brand_uid)) > 0),
  store_uid text not null check (length(btrim(store_uid)) > 0),
  checkpoint_end_ms bigint null check (checkpoint_end_ms is null or checkpoint_end_ms >= 0),
  last_success_at timestamptz null,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (company_uid, brand_uid, store_uid),
  constraint cing_kds_fabi_runtime_lease_pair_ck check (
    (lease_token is null and lease_expires_at is null)
    or (lease_token is not null and lease_expires_at is not null)
  )
);

alter table public.cing_kds_fabi_runtime_branch_v1 enable row level security;
revoke all on table public.cing_kds_fabi_runtime_branch_v1
from public, anon, authenticated, service_role;

create function public.cing_kds_fabi_runtime_lease_acquire_v1(
  p_company_uid text, p_brand_uid text, p_store_uid text, p_lease_seconds integer
)
returns table (acquired boolean, lease_token uuid, lease_expires_at timestamptz, checkpoint_end_ms bigint)
language plpgsql security definer set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_row public.cing_kds_fabi_runtime_branch_v1%rowtype;
  v_now timestamptz;
  v_company_uid text := nullif(btrim(p_company_uid), '');
  v_brand_uid text := nullif(btrim(p_brand_uid), '');
  v_store_uid text := nullif(btrim(p_store_uid), '');
begin
  if v_company_uid is null or v_brand_uid is null or v_store_uid is null then
    raise exception 'CING_KDS_RUNTIME_SCOPE_REQUIRED';
  end if;
  if p_lease_seconds is distinct from 120 then
    raise exception 'CING_KDS_RUNTIME_EXACT_LEASE_SECONDS_REQUIRED';
  end if;
  insert into public.cing_kds_fabi_runtime_branch_v1 (company_uid, brand_uid, store_uid)
  values (v_company_uid, v_brand_uid, v_store_uid)
  on conflict (company_uid, brand_uid, store_uid) do nothing;
  select * into v_row from public.cing_kds_fabi_runtime_branch_v1
   where company_uid = v_company_uid and brand_uid = v_brand_uid and store_uid = v_store_uid
   for update;
  if not found then raise exception 'CING_KDS_RUNTIME_BRANCH_ROW_MISSING'; end if;
  v_now := clock_timestamp();
  if v_row.lease_token is not null and v_row.lease_expires_at > v_now then
    return query select false, null::uuid, v_row.lease_expires_at, v_row.checkpoint_end_ms;
    return;
  end if;
  update public.cing_kds_fabi_runtime_branch_v1
     set lease_token = pg_catalog.gen_random_uuid(),
         lease_expires_at = v_now + make_interval(secs => 120), updated_at = v_now
   where company_uid = v_company_uid and brand_uid = v_brand_uid and store_uid = v_store_uid
  returning * into v_row;
  return query select true, v_row.lease_token, v_row.lease_expires_at, v_row.checkpoint_end_ms;
end;
$$;

create function public.cing_kds_fabi_runtime_checkpoint_commit_v1(
  p_company_uid text, p_brand_uid text, p_store_uid text, p_lease_token uuid, p_checkpoint_end_ms bigint
)
returns table (committed boolean, checkpoint_end_ms bigint)
language plpgsql security definer set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_row public.cing_kds_fabi_runtime_branch_v1%rowtype;
  v_now timestamptz;
  v_company_uid text := nullif(btrim(p_company_uid), '');
  v_brand_uid text := nullif(btrim(p_brand_uid), '');
  v_store_uid text := nullif(btrim(p_store_uid), '');
begin
  if v_company_uid is null or v_brand_uid is null or v_store_uid is null or p_lease_token is null then
    raise exception 'CING_KDS_RUNTIME_COMMIT_IDENTITY_REQUIRED';
  end if;
  if p_checkpoint_end_ms is null or p_checkpoint_end_ms < 0 then
    raise exception 'CING_KDS_RUNTIME_CHECKPOINT_INVALID';
  end if;
  select * into v_row from public.cing_kds_fabi_runtime_branch_v1
   where company_uid = v_company_uid and brand_uid = v_brand_uid and store_uid = v_store_uid for update;
  if not found then raise exception 'CING_KDS_RUNTIME_BRANCH_ROW_MISSING'; end if;
  v_now := clock_timestamp();
  if v_row.lease_token is distinct from p_lease_token then
    raise exception 'CING_KDS_RUNTIME_LEASE_FENCE_CONFLICT';
  end if;
  if v_row.lease_expires_at is null or v_row.lease_expires_at <= v_now then
    raise exception 'CING_KDS_RUNTIME_LEASE_EXPIRED';
  end if;
  if v_row.checkpoint_end_ms is not null and p_checkpoint_end_ms < v_row.checkpoint_end_ms then
    raise exception 'CING_KDS_RUNTIME_CHECKPOINT_REGRESSION';
  end if;
  update public.cing_kds_fabi_runtime_branch_v1
     set checkpoint_end_ms = p_checkpoint_end_ms, last_success_at = v_now,
         lease_token = null, lease_expires_at = null, updated_at = v_now
   where company_uid = v_company_uid and brand_uid = v_brand_uid and store_uid = v_store_uid;
  return query select true, p_checkpoint_end_ms;
end;
$$;

create function public.cing_kds_fabi_runtime_lease_renew_v1(
  p_company_uid text, p_brand_uid text, p_store_uid text, p_lease_token uuid, p_lease_seconds integer
)
returns table (renewed boolean, lease_expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_row public.cing_kds_fabi_runtime_branch_v1%rowtype;
  v_now timestamptz;
  v_company_uid text := nullif(btrim(p_company_uid), '');
  v_brand_uid text := nullif(btrim(p_brand_uid), '');
  v_store_uid text := nullif(btrim(p_store_uid), '');
begin
  if v_company_uid is null or v_brand_uid is null or v_store_uid is null or p_lease_token is null then
    raise exception 'CING_KDS_RUNTIME_RENEW_IDENTITY_REQUIRED';
  end if;
  if p_lease_seconds is distinct from 120 then
    raise exception 'CING_KDS_RUNTIME_EXACT_LEASE_SECONDS_REQUIRED';
  end if;
  select * into v_row from public.cing_kds_fabi_runtime_branch_v1
   where company_uid = v_company_uid and brand_uid = v_brand_uid and store_uid = v_store_uid for update;
  if not found then raise exception 'CING_KDS_RUNTIME_BRANCH_ROW_MISSING'; end if;
  v_now := clock_timestamp();
  if v_row.lease_token is distinct from p_lease_token
     or v_row.lease_expires_at is null or v_row.lease_expires_at <= v_now then
    return query select false, null::timestamptz;
    return;
  end if;
  update public.cing_kds_fabi_runtime_branch_v1
     set lease_expires_at = v_now + make_interval(secs => 120), updated_at = v_now
   where company_uid = v_company_uid and brand_uid = v_brand_uid and store_uid = v_store_uid
     and lease_token = p_lease_token
  returning * into v_row;
  return query select true, v_row.lease_expires_at;
end;
$$;

create function public.cing_kds_fabi_runtime_lease_release_v1(
  p_company_uid text, p_brand_uid text, p_store_uid text, p_lease_token uuid
)
returns table (released boolean)
language plpgsql security definer set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_count integer;
  v_company_uid text := nullif(btrim(p_company_uid), '');
  v_brand_uid text := nullif(btrim(p_brand_uid), '');
  v_store_uid text := nullif(btrim(p_store_uid), '');
begin
  if v_company_uid is null or v_brand_uid is null or v_store_uid is null or p_lease_token is null then
    raise exception 'CING_KDS_RUNTIME_RELEASE_IDENTITY_REQUIRED';
  end if;
  update public.cing_kds_fabi_runtime_branch_v1
     set lease_token = null, lease_expires_at = null, updated_at = clock_timestamp()
   where company_uid = v_company_uid and brand_uid = v_brand_uid and store_uid = v_store_uid
     and lease_token = p_lease_token;
  get diagnostics v_count = row_count;
  return query select v_count = 1;
end;
$$;

revoke all on function public.cing_kds_fabi_runtime_lease_acquire_v1(text, text, text, integer)
from public, anon, authenticated, service_role;
revoke all on function public.cing_kds_fabi_runtime_checkpoint_commit_v1(text, text, text, uuid, bigint)
from public, anon, authenticated, service_role;
revoke all on function public.cing_kds_fabi_runtime_lease_renew_v1(text, text, text, uuid, integer)
from public, anon, authenticated, service_role;
revoke all on function public.cing_kds_fabi_runtime_lease_release_v1(text, text, text, uuid)
from public, anon, authenticated, service_role;

comment on table public.cing_kds_fabi_runtime_branch_v1 is
'Cing KDS P2 private per-branch fenced lease and recovery checkpoint. It is scheduling metadata only, never source or payment authority.';

commit;
