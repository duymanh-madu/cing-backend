-- CING KDS P7 mapping-evidence candidate. SOURCE ONLY: DO NOT EXECUTE WITHOUT NEW PRODUCTION AUTHORIZATION.
begin;
do $$
declare v_rls boolean;
begin
  if to_regclass('public.cing_kds_shadow_pilot_observation_v1') is null then raise exception 'KDS_P7_P6_REQUIRED'; end if;
  select relrowsecurity into v_rls from pg_class where oid='public.cing_kds_shadow_pilot_observation_v1'::regclass;
  if v_rls is distinct from true or has_table_privilege('service_role','public.cing_kds_shadow_pilot_observation_v1','select') then raise exception 'KDS_P7_P6_ACCESS_DRIFT'; end if;
  if to_regclass('public.cing_kds_source_mapping_evidence_p7_v1') is not null then raise exception 'KDS_P7_TABLE_ALREADY_PRESENT'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cing_kds_source_mapping_record_p7_v1') then raise exception 'KDS_P7_FUNCTION_ALREADY_PRESENT'; end if;
end; $$;

create table public.cing_kds_source_mapping_evidence_p7_v1 (
  mapping_key uuid primary key,
  pos_parent text not null check(pos_parent='BRAND-DQIR'),
  pos_id text not null check(pos_id='109664'),
  company_uid text not null check(company_uid~'^[0-9a-fA-F-]{36}$'),
  brand_uid text not null check(brand_uid~'^[0-9a-fA-F-]{36}$'),
  store_uid text not null check(store_uid~'^[0-9a-fA-F-]{36}$'),
  mapping_status text not null check(mapping_status='source_verified'),
  source_observed_at timestamptz not null,
  evidence_digest text not null check(evidence_digest~'^[a-f0-9]{64}$'),
  observed_at timestamptz not null default clock_timestamp(),
  unique(pos_parent,pos_id,evidence_digest)
);
alter table public.cing_kds_source_mapping_evidence_p7_v1 enable row level security;
revoke all on table public.cing_kds_source_mapping_evidence_p7_v1 from public,anon,authenticated,service_role;

create function public.cing_kds_source_mapping_record_p7_v1(p_mapping_key uuid,p_pos_parent text,p_pos_id text,p_company_uid text,p_brand_uid text,p_store_uid text,p_source_observed_at timestamptz,p_evidence_digest text)
returns table(record_state text,mapping_status text)
language plpgsql security definer set search_path=public,pg_catalog,pg_temp as $$
declare v_row public.cing_kds_source_mapping_evidence_p7_v1%rowtype;
begin
  if p_mapping_key is null or nullif(btrim(p_pos_parent),'') is distinct from 'BRAND-DQIR' or nullif(btrim(p_pos_id),'') is distinct from '109664' then raise exception 'KDS_P7_TARGET_INVALID'; end if;
  if p_company_uid !~ '^[0-9a-fA-F-]{36}$' or p_brand_uid !~ '^[0-9a-fA-F-]{36}$' or p_store_uid !~ '^[0-9a-fA-F-]{36}$' or p_source_observed_at is null or p_evidence_digest !~ '^[a-f0-9]{64}$' then raise exception 'KDS_P7_EVIDENCE_INVALID'; end if;
  insert into public.cing_kds_source_mapping_evidence_p7_v1(mapping_key,pos_parent,pos_id,company_uid,brand_uid,store_uid,mapping_status,source_observed_at,evidence_digest) values(p_mapping_key,'BRAND-DQIR','109664',p_company_uid,p_brand_uid,p_store_uid,'source_verified',p_source_observed_at,p_evidence_digest) on conflict(mapping_key) do nothing;
  if found then return query select 'inserted'::text,'source_verified'::text; return; end if;
  select * into v_row from public.cing_kds_source_mapping_evidence_p7_v1 where mapping_key=p_mapping_key for update;
  if not found then raise exception 'KDS_P7_MAPPING_ROW_MISSING'; end if;
  if row(v_row.pos_parent,v_row.pos_id,v_row.company_uid,v_row.brand_uid,v_row.store_uid,v_row.source_observed_at,v_row.evidence_digest) is distinct from row('BRAND-DQIR','109664',p_company_uid,p_brand_uid,p_store_uid,p_source_observed_at,p_evidence_digest) then raise exception 'KDS_P7_MAPPING_CONFLICT'; end if;
  return query select 'duplicate'::text,v_row.mapping_status;
end; $$;
revoke all on function public.cing_kds_source_mapping_record_p7_v1(uuid,text,text,text,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_source_mapping_record_p7_v1(uuid,text,text,text,text,text,timestamptz,text) to service_role;
commit;
