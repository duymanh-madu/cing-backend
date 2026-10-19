-- CING KDS Recovery R3/P3. SOURCE REVIEW ONLY. NOT AUTHORIZED FOR PRODUCTION EXECUTION.
begin;

do $$
declare v_count integer; v_hash text; v_rls boolean;
begin
  if to_regclass('public.cing_kds_production_adoption_v1') is null then raise exception 'KDS_P3_P0_ADOPTION_RECORD_MISSING'; end if;
  select count(*), min(preflight_sha256) into v_count, v_hash from public.cing_kds_production_adoption_v1 where adoption_key = 'kds_r2_contained_draft_baseline_v1';
  if v_count <> 1 or v_hash is distinct from '03f49bd10dbd7f41b7c234bf2914e635217443fe2e65ce7e721287b6c56c45b6' then raise exception 'KDS_P3_P0_ADOPTION_DRIFT'; end if;
  if to_regclass('public.cing_kds_fabi_c04_event_inbox') is null or to_regclass('public.cing_kds_fabi_runtime_branch_v1') is null then raise exception 'KDS_P3_PREREQUISITE_TABLE_MISSING'; end if;
  select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='cing_kds_fabi_runtime_branch_v1';
  if v_rls is distinct from true or has_table_privilege('anon','public.cing_kds_fabi_runtime_branch_v1','select') or has_table_privilege('authenticated','public.cing_kds_fabi_runtime_branch_v1','select') or has_table_privilege('service_role','public.cing_kds_fabi_runtime_branch_v1','select') then raise exception 'KDS_P3_P2_RUNTIME_DRIFT'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cing_kds_fabi_runtime_lease_acquire_v1','cing_kds_fabi_runtime_checkpoint_commit_v1','cing_kds_fabi_runtime_lease_renew_v1','cing_kds_fabi_runtime_lease_release_v1') and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))) then raise exception 'KDS_P3_P2_RUNTIME_GRANT_DRIFT'; end if;
  if to_regclass('public.cing_kds_fabi_reconciliation_queue_v1') is not null or to_regclass('public.cing_kds_fabi_reconciliation_due_idx') is not null then raise exception 'KDS_P3_QUEUE_RELATION_ALREADY_PRESENT'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cing_kds_fabi_reconciliation_result_put_v1','cing_kds_fabi_reconciliation_claim_due_v1','cing_kds_fabi_reconciliation_resolve_claim_v1')) then raise exception 'KDS_P3_QUEUE_FUNCTION_ALREADY_PRESENT'; end if;
  if to_regprocedure('pg_catalog.gen_random_uuid()') is null then raise exception 'KDS_P3_UUID_GENERATOR_MISSING'; end if;
end; $$;

create table public.cing_kds_fabi_reconciliation_queue_v1 (
  company_uid text not null check (length(btrim(company_uid))>0), brand_uid text not null check (length(btrim(brand_uid))>0), store_uid text not null check (length(btrim(store_uid))>0), tran_id text not null check (length(btrim(tran_id))>0),
  reconciliation_status text not null check (reconciliation_status in ('pending_c03','ready','review_required')), state_fingerprint text not null check (state_fingerprint ~ '^[a-f0-9]{64}$'), result_version bigint not null default 1 check(result_version>=1), attempt_count bigint not null default 0 check(attempt_count>=0),
  next_reconcile_at timestamptz null, last_attempt_at timestamptz null, claim_token uuid null, claim_expires_at timestamptz null,
  first_observed_at timestamptz not null default clock_timestamp(), last_result_at timestamptz not null default clock_timestamp(), created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  primary key(company_uid,brand_uid,store_uid,tran_id),
  constraint cing_kds_fabi_recon_claim_pair_ck check ((claim_token is null and claim_expires_at is null) or (claim_token is not null and claim_expires_at is not null)),
  constraint cing_kds_fabi_recon_schedule_ck check ((reconciliation_status='pending_c03' and next_reconcile_at is not null) or (reconciliation_status in ('ready','review_required') and next_reconcile_at is null))
);
create index cing_kds_fabi_reconciliation_due_idx on public.cing_kds_fabi_reconciliation_queue_v1(company_uid,brand_uid,store_uid,reconciliation_status,next_reconcile_at,tran_id) where reconciliation_status='pending_c03';
alter table public.cing_kds_fabi_reconciliation_queue_v1 enable row level security;
revoke all on table public.cing_kds_fabi_reconciliation_queue_v1 from public, anon, authenticated, service_role;

create function public.cing_kds_fabi_reconciliation_result_put_v1(p_company_uid text,p_brand_uid text,p_store_uid text,p_tran_id text,p_status text,p_state_fingerprint text,p_retry_delay_seconds integer)
returns table(reconciliation_status text,result_version bigint,attempt_count bigint,next_reconcile_at timestamptz)
language plpgsql security definer set search_path=public,pg_catalog,pg_temp as $$
declare v_row public.cing_kds_fabi_reconciliation_queue_v1%rowtype; v_now timestamptz:=clock_timestamp(); v_next timestamptz; v_company text:=nullif(btrim(p_company_uid),''); v_brand text:=nullif(btrim(p_brand_uid),''); v_store text:=nullif(btrim(p_store_uid),''); v_tran text:=nullif(btrim(p_tran_id),'');
begin
  if v_company is null or v_brand is null or v_store is null or v_tran is null then raise exception 'CING_KDS_RECON_IDENTITY_REQUIRED'; end if;
  if p_status not in ('pending_c03','ready','review_required') then raise exception 'CING_KDS_RECON_STATUS_INVALID'; end if;
  if p_state_fingerprint is null or p_state_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'CING_KDS_RECON_FINGERPRINT_INVALID'; end if;
  if p_status='pending_c03' and (p_retry_delay_seconds is null or p_retry_delay_seconds<1 or p_retry_delay_seconds>32400) then raise exception 'CING_KDS_RECON_RETRY_DELAY_INVALID'; end if;
  if p_status<>'pending_c03' and p_retry_delay_seconds is not null then raise exception 'CING_KDS_RECON_TERMINAL_RETRY_FORBIDDEN'; end if;
  v_next:=case when p_status='pending_c03' then v_now+make_interval(secs=>p_retry_delay_seconds) else null end;
  insert into public.cing_kds_fabi_reconciliation_queue_v1(company_uid,brand_uid,store_uid,tran_id,reconciliation_status,state_fingerprint,next_reconcile_at,first_observed_at,last_result_at,created_at,updated_at) values(v_company,v_brand,v_store,v_tran,p_status,p_state_fingerprint,v_next,v_now,v_now,v_now,v_now) on conflict(company_uid,brand_uid,store_uid,tran_id) do nothing returning * into v_row;
  if found then return query select v_row.reconciliation_status,v_row.result_version,v_row.attempt_count,v_row.next_reconcile_at; return; end if;
  select * into v_row from public.cing_kds_fabi_reconciliation_queue_v1 where company_uid=v_company and brand_uid=v_brand and store_uid=v_store and tran_id=v_tran for update;
  if not found then raise exception 'CING_KDS_RECON_ROW_MISSING'; end if;
  if v_row.reconciliation_status is not distinct from p_status and v_row.state_fingerprint is not distinct from p_state_fingerprint then return query select v_row.reconciliation_status,v_row.result_version,v_row.attempt_count,v_row.next_reconcile_at; return; end if;
  update public.cing_kds_fabi_reconciliation_queue_v1 set reconciliation_status=p_status,state_fingerprint=p_state_fingerprint,result_version=result_version+1,next_reconcile_at=v_next,claim_token=null,claim_expires_at=null,last_result_at=v_now,updated_at=v_now where company_uid=v_company and brand_uid=v_brand and store_uid=v_store and tran_id=v_tran returning * into v_row;
  return query select v_row.reconciliation_status,v_row.result_version,v_row.attempt_count,v_row.next_reconcile_at;
end; $$;

create function public.cing_kds_fabi_reconciliation_claim_due_v1(p_company_uid text,p_brand_uid text,p_store_uid text,p_batch_size integer,p_lease_seconds integer)
returns table(tran_id text,claim_token uuid,result_version bigint,state_fingerprint text,attempt_count bigint)
language plpgsql security definer set search_path=public,pg_catalog,pg_temp as $$
declare v_now timestamptz:=clock_timestamp(); v_candidate record; v_company text:=nullif(btrim(p_company_uid),''); v_brand text:=nullif(btrim(p_brand_uid),''); v_store text:=nullif(btrim(p_store_uid),'');
begin
  if v_company is null or v_brand is null or v_store is null then raise exception 'CING_KDS_RECON_CLAIM_SCOPE_REQUIRED'; end if;
  if p_batch_size is null or p_batch_size<1 or p_batch_size>100 then raise exception 'CING_KDS_RECON_BATCH_SIZE_INVALID'; end if;
  if p_lease_seconds is distinct from 120 then raise exception 'CING_KDS_RECON_EXACT_LEASE_SECONDS_REQUIRED'; end if;
  for v_candidate in select q.tran_id from public.cing_kds_fabi_reconciliation_queue_v1 q where q.company_uid=v_company and q.brand_uid=v_brand and q.store_uid=v_store and q.reconciliation_status='pending_c03' and q.next_reconcile_at<=v_now and (q.claim_token is null or q.claim_expires_at<=v_now) order by q.next_reconcile_at,q.tran_id for update skip locked limit p_batch_size loop
    update public.cing_kds_fabi_reconciliation_queue_v1 q set claim_token=pg_catalog.gen_random_uuid(),claim_expires_at=v_now+make_interval(secs=>120),attempt_count=q.attempt_count+1,last_attempt_at=v_now,updated_at=v_now where q.company_uid=v_company and q.brand_uid=v_brand and q.store_uid=v_store and q.tran_id=v_candidate.tran_id returning q.tran_id,q.claim_token,q.result_version,q.state_fingerprint,q.attempt_count into tran_id,claim_token,result_version,state_fingerprint,attempt_count;
    return next;
  end loop;
end; $$;

create function public.cing_kds_fabi_reconciliation_resolve_claim_v1(p_company_uid text,p_brand_uid text,p_store_uid text,p_tran_id text,p_claim_token uuid,p_expected_result_version bigint,p_status text,p_state_fingerprint text,p_retry_delay_seconds integer)
returns table(reconciliation_status text,result_version bigint,attempt_count bigint,next_reconcile_at timestamptz)
language plpgsql security definer set search_path=public,pg_catalog,pg_temp as $$
declare v_row public.cing_kds_fabi_reconciliation_queue_v1%rowtype; v_now timestamptz:=clock_timestamp(); v_next timestamptz; v_company text:=nullif(btrim(p_company_uid),''); v_brand text:=nullif(btrim(p_brand_uid),''); v_store text:=nullif(btrim(p_store_uid),''); v_tran text:=nullif(btrim(p_tran_id),'');
begin
  if v_company is null or v_brand is null or v_store is null or v_tran is null or p_claim_token is null or p_expected_result_version is null or p_expected_result_version<1 then raise exception 'CING_KDS_RECON_RESOLVE_IDENTITY_REQUIRED'; end if;
  if p_status not in ('pending_c03','ready','review_required') then raise exception 'CING_KDS_RECON_STATUS_INVALID'; end if;
  if p_state_fingerprint is null or p_state_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'CING_KDS_RECON_FINGERPRINT_INVALID'; end if;
  if p_status='pending_c03' and (p_retry_delay_seconds is null or p_retry_delay_seconds<1 or p_retry_delay_seconds>32400) then raise exception 'CING_KDS_RECON_RETRY_DELAY_INVALID'; end if;
  if p_status<>'pending_c03' and p_retry_delay_seconds is not null then raise exception 'CING_KDS_RECON_TERMINAL_RETRY_FORBIDDEN'; end if;
  select * into v_row from public.cing_kds_fabi_reconciliation_queue_v1 where company_uid=v_company and brand_uid=v_brand and store_uid=v_store and tran_id=v_tran for update;
  if not found then raise exception 'CING_KDS_RECON_ROW_MISSING'; end if;
  if v_row.claim_token is distinct from p_claim_token then raise exception 'CING_KDS_RECON_CLAIM_FENCE_CONFLICT'; end if;
  if v_row.claim_expires_at is null or v_row.claim_expires_at<=v_now then raise exception 'CING_KDS_RECON_CLAIM_EXPIRED'; end if;
  if v_row.result_version<>p_expected_result_version then raise exception 'CING_KDS_RECON_RESULT_VERSION_CONFLICT'; end if;
  v_next:=case when p_status='pending_c03' then v_now+make_interval(secs=>p_retry_delay_seconds) else null end;
  update public.cing_kds_fabi_reconciliation_queue_v1 set reconciliation_status=p_status,state_fingerprint=p_state_fingerprint,result_version=result_version+1,next_reconcile_at=v_next,claim_token=null,claim_expires_at=null,last_result_at=v_now,updated_at=v_now where company_uid=v_company and brand_uid=v_brand and store_uid=v_store and tran_id=v_tran returning * into v_row;
  return query select v_row.reconciliation_status,v_row.result_version,v_row.attempt_count,v_row.next_reconcile_at;
end; $$;

revoke all on function public.cing_kds_fabi_reconciliation_result_put_v1(text,text,text,text,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_reconciliation_claim_due_v1(text,text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_reconciliation_resolve_claim_v1(text,text,text,text,uuid,bigint,text,text,integer) from public,anon,authenticated,service_role;
commit;
