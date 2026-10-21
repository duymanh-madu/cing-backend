-- CING KDS P6 shadow-pilot candidate. SOURCE ONLY: DO NOT EXECUTE WITHOUT NEW PRODUCTION AUTHORIZATION.
begin;

do $$
declare v_count integer; v_name text; v_rls boolean;
begin
  if to_regclass('public.cing_kds_production_adoption_v1') is null then raise exception 'KDS_P6_P0_ADOPTION_MISSING'; end if;
  select count(*) into v_count from public.cing_kds_production_adoption_v1 where adoption_key='kds_r2_contained_draft_baseline_v1' and preflight_sha256='03f49bd10dbd7f41b7c234bf2914e635217443fe2e65ce7e721287b6c56c45b6';
  if v_count<>1 then raise exception 'KDS_P6_P0_ADOPTION_DRIFT'; end if;
  foreach v_name in array array['cing_kds_fabi_c04_event_inbox','cing_kds_fabi_runtime_branch_v1','cing_kds_fabi_reconciliation_queue_v1'] loop
    if to_regclass('public.'||v_name) is null then raise exception 'KDS_P6_PREREQUISITE_MISSING:%',v_name; end if;
    select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=v_name;
    if v_rls is distinct from true or has_table_privilege('anon','public.'||v_name,'select') or has_table_privilege('authenticated','public.'||v_name,'select') or has_table_privilege('service_role','public.'||v_name,'select') then raise exception 'KDS_P6_PREREQUISITE_ACCESS_DRIFT:%',v_name; end if;
  end loop;
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cing_kds_fabi_c04_event_inbox_put_v1','cing_kds_fabi_c04_event_inbox_load_tran_v1','cing_kds_fabi_runtime_lease_acquire_v1','cing_kds_fabi_runtime_checkpoint_commit_v1','cing_kds_fabi_runtime_lease_renew_v1','cing_kds_fabi_runtime_lease_release_v1','cing_kds_fabi_reconciliation_result_put_v1','cing_kds_fabi_reconciliation_claim_due_v1','cing_kds_fabi_reconciliation_resolve_claim_v1');
  if v_count<>9 then raise exception 'KDS_P6_P4_RPC_SURFACE_DRIFT'; end if;
  if to_regclass('public.cing_kds_shadow_pilot_observation_v1') is not null or to_regprocedure('public.cing_kds_shadow_pilot_observation_record_v1(uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,text,boolean,boolean,bigint,bigint,bigint,bigint,bigint)') is not null then raise exception 'KDS_P6_RELATION_ALREADY_PRESENT'; end if;
end; $$;

create table public.cing_kds_shadow_pilot_observation_v1 (
  observation_key uuid primary key,
  pos_parent text not null check (pos_parent='BRAND-DQIR'),
  pos_id text not null check (pos_id='109664'),
  company_uid text not null check (company_uid ~ '^[0-9a-fA-F-]{36}$'),
  brand_uid text not null check (brand_uid ~ '^[0-9a-fA-F-]{36}$'),
  store_uid text not null check (store_uid ~ '^[0-9a-fA-F-]{36}$'),
  mapping_status text not null check (mapping_status='configured_not_source_verified'),
  status text not null check (status in ('observed','hold')),
  error_code text null check (error_code is null or error_code ~ '^[A-Z0-9_]{3,120}$'),
  duration_ms bigint not null check (duration_ms>=0 and duration_ms<120000),
  c03_count bigint not null check (c03_count>=0), c03_timeout_count bigint not null check (c03_timeout_count>=0), c03_max_duration_ms bigint not null check (c03_max_duration_ms>=0),
  c04_count bigint not null check (c04_count>=0), c04_timeout_count bigint not null check (c04_timeout_count>=0), c04_max_duration_ms bigint not null check (c04_max_duration_ms>=0),
  runner_status text null check (runner_status is null or runner_status in ('committed','invalid')),
  polled boolean not null, checkpoint_committed boolean not null,
  transaction_count bigint not null check (transaction_count>=0), fetched_event_count bigint not null check (fetched_event_count>=0), durable_event_count bigint not null check (durable_event_count>=0), retries_claimed bigint not null check (retries_claimed>=0), retries_resolved bigint not null check (retries_resolved>=0),
  observed_at timestamptz not null default clock_timestamp(),
  check ((status='observed' and error_code is null and runner_status='committed' and checkpoint_committed=true) or status='hold')
);

alter table public.cing_kds_shadow_pilot_observation_v1 enable row level security;
revoke all on table public.cing_kds_shadow_pilot_observation_v1 from public,anon,authenticated,service_role;

create function public.cing_kds_shadow_pilot_observation_record_v1(
  p_observation_key uuid,p_pos_parent text,p_pos_id text,p_company_uid text,p_brand_uid text,p_store_uid text,p_mapping_status text,p_status text,p_error_code text,p_duration_ms bigint,
  p_c03_count bigint,p_c03_timeout_count bigint,p_c03_max_duration_ms bigint,p_c04_count bigint,p_c04_timeout_count bigint,p_c04_max_duration_ms bigint,
  p_runner_status text,p_polled boolean,p_checkpoint_committed boolean,p_transaction_count bigint,p_fetched_event_count bigint,p_durable_event_count bigint,p_retries_claimed bigint,p_retries_resolved bigint
) returns table(record_state text)
language plpgsql security definer set search_path=public,pg_catalog,pg_temp as $$
declare v_existing public.cing_kds_shadow_pilot_observation_v1%rowtype;
begin
  if p_observation_key is null or nullif(btrim(p_pos_parent),'') is distinct from 'BRAND-DQIR' or nullif(btrim(p_pos_id),'') is distinct from '109664' then raise exception 'KDS_SHADOW_TARGET_INVALID'; end if;
  if p_company_uid !~ '^[0-9a-fA-F-]{36}$' or p_brand_uid !~ '^[0-9a-fA-F-]{36}$' or p_store_uid !~ '^[0-9a-fA-F-]{36}$' then raise exception 'KDS_SHADOW_SCOPE_INVALID'; end if;
  if p_mapping_status is distinct from 'configured_not_source_verified' or p_status not in ('observed','hold') or p_duration_ms is null or p_duration_ms<0 or p_duration_ms>=120000 then raise exception 'KDS_SHADOW_EVIDENCE_INVALID'; end if;
  if p_c03_count<0 or p_c03_timeout_count<0 or p_c03_max_duration_ms<0 or p_c04_count<0 or p_c04_timeout_count<0 or p_c04_max_duration_ms<0 or p_transaction_count<0 or p_fetched_event_count<0 or p_durable_event_count<0 or p_retries_claimed<0 or p_retries_resolved<0 then raise exception 'KDS_SHADOW_EVIDENCE_INVALID'; end if;
  if (p_status='observed' and (p_error_code is not null or p_runner_status is distinct from 'committed' or p_checkpoint_committed is distinct from true)) or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{3,120}$') then raise exception 'KDS_SHADOW_RESULT_INVALID'; end if;
  insert into public.cing_kds_shadow_pilot_observation_v1(observation_key,pos_parent,pos_id,company_uid,brand_uid,store_uid,mapping_status,status,error_code,duration_ms,c03_count,c03_timeout_count,c03_max_duration_ms,c04_count,c04_timeout_count,c04_max_duration_ms,runner_status,polled,checkpoint_committed,transaction_count,fetched_event_count,durable_event_count,retries_claimed,retries_resolved)
  values(p_observation_key,'BRAND-DQIR','109664',p_company_uid,p_brand_uid,p_store_uid,p_mapping_status,p_status,p_error_code,p_duration_ms,p_c03_count,p_c03_timeout_count,p_c03_max_duration_ms,p_c04_count,p_c04_timeout_count,p_c04_max_duration_ms,p_runner_status,p_polled,p_checkpoint_committed,p_transaction_count,p_fetched_event_count,p_durable_event_count,p_retries_claimed,p_retries_resolved)
  on conflict(observation_key) do nothing;
  if found then return query select 'inserted'::text; return; end if;
  select * into v_existing from public.cing_kds_shadow_pilot_observation_v1 where observation_key=p_observation_key for update;
  if not found then raise exception 'KDS_SHADOW_ROW_MISSING'; end if;
  if row(v_existing.pos_parent,v_existing.pos_id,v_existing.company_uid,v_existing.brand_uid,v_existing.store_uid,v_existing.mapping_status,v_existing.status,v_existing.error_code,v_existing.duration_ms,v_existing.c03_count,v_existing.c03_timeout_count,v_existing.c03_max_duration_ms,v_existing.c04_count,v_existing.c04_timeout_count,v_existing.c04_max_duration_ms,v_existing.runner_status,v_existing.polled,v_existing.checkpoint_committed,v_existing.transaction_count,v_existing.fetched_event_count,v_existing.durable_event_count,v_existing.retries_claimed,v_existing.retries_resolved) is distinct from row('BRAND-DQIR','109664',p_company_uid,p_brand_uid,p_store_uid,p_mapping_status,p_status,p_error_code,p_duration_ms,p_c03_count,p_c03_timeout_count,p_c03_max_duration_ms,p_c04_count,p_c04_timeout_count,p_c04_max_duration_ms,p_runner_status,p_polled,p_checkpoint_committed,p_transaction_count,p_fetched_event_count,p_durable_event_count,p_retries_claimed,p_retries_resolved) then raise exception 'KDS_SHADOW_OBSERVATION_CONFLICT'; end if;
  return query select 'duplicate'::text;
end; $$;

revoke all on function public.cing_kds_shadow_pilot_observation_record_v1(uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,text,boolean,boolean,bigint,bigint,bigint,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_shadow_pilot_observation_record_v1(uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,text,boolean,boolean,bigint,bigint,bigint,bigint,bigint) to service_role;
commit;
