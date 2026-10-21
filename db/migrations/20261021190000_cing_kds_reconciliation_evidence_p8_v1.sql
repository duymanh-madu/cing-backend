-- CING KDS P8 reconciliation-evidence candidate. SOURCE ONLY: DO NOT EXECUTE WITHOUT NEW PRODUCTION AUTHORIZATION.
begin;
do $$
begin
  if to_regclass('public.cing_kds_source_mapping_evidence_p7_v1') is null then raise exception 'KDS_P8_P7_REQUIRED'; end if;
  if to_regclass('public.cing_kds_reconciliation_evidence_p8_v1') is not null then raise exception 'KDS_P8_TABLE_ALREADY_PRESENT'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cing_kds_reconciliation_record_p8_v1') then raise exception 'KDS_P8_FUNCTION_ALREADY_PRESENT'; end if;
end; $$;

create table public.cing_kds_reconciliation_evidence_p8_v1 (
  reconciliation_key uuid primary key,
  mapping_key uuid not null references public.cing_kds_source_mapping_evidence_p7_v1(mapping_key),
  pos_parent text not null check(pos_parent='BRAND-DQIR'), pos_id text not null check(pos_id='109664'),
  source_invoice_count bigint not null check(source_invoice_count>=0), projected_invoice_count bigint not null check(projected_invoice_count>=0), missing_invoice_count bigint not null check(missing_invoice_count>=0), extra_invoice_count bigint not null check(extra_invoice_count>=0),
  item_pass_count bigint not null check(item_pass_count>=0), item_fail_count bigint not null check(item_fail_count>=0), cup_expected_count bigint not null check(cup_expected_count>=0), cup_projected_count bigint not null check(cup_projected_count>=0),
  source_snapshot_complete boolean not null, recovery_complete boolean not null, modifiers_verified boolean not null,
  reconciliation_status text not null check(reconciliation_status in ('pass','hold')),
  evaluated_at timestamptz not null default clock_timestamp()
);
alter table public.cing_kds_reconciliation_evidence_p8_v1 enable row level security;
revoke all on table public.cing_kds_reconciliation_evidence_p8_v1 from public,anon,authenticated,service_role;

create function public.cing_kds_reconciliation_record_p8_v1(p_reconciliation_key uuid,p_mapping_key uuid,p_pos_parent text,p_pos_id text,p_source_invoice_count bigint,p_projected_invoice_count bigint,p_missing_invoice_count bigint,p_extra_invoice_count bigint,p_item_pass_count bigint,p_item_fail_count bigint,p_cup_expected_count bigint,p_cup_projected_count bigint,p_source_snapshot_complete boolean,p_recovery_complete boolean,p_modifiers_verified boolean)
returns table(record_state text,reconciliation_status text)
language plpgsql security definer set search_path=public,pg_catalog,pg_temp as $$
declare v_mapping public.cing_kds_source_mapping_evidence_p7_v1%rowtype; v_row public.cing_kds_reconciliation_evidence_p8_v1%rowtype; v_status text;
begin
  if p_reconciliation_key is null or p_mapping_key is null or nullif(btrim(p_pos_parent),'') is distinct from 'BRAND-DQIR' or nullif(btrim(p_pos_id),'') is distinct from '109664' then raise exception 'KDS_P8_TARGET_INVALID'; end if;
  if p_source_invoice_count<0 or p_projected_invoice_count<0 or p_missing_invoice_count<0 or p_extra_invoice_count<0 or p_item_pass_count<0 or p_item_fail_count<0 or p_cup_expected_count<0 or p_cup_projected_count<0 or p_source_snapshot_complete is null or p_recovery_complete is null or p_modifiers_verified is null then raise exception 'KDS_P8_METRICS_INVALID'; end if;
  select * into v_mapping from public.cing_kds_source_mapping_evidence_p7_v1 where mapping_key=p_mapping_key for key share;
  if not found or v_mapping.mapping_status<>'source_verified' then raise exception 'KDS_P8_MAPPING_NOT_VERIFIED'; end if;
  v_status:=case when p_source_snapshot_complete and p_recovery_complete and p_modifiers_verified and p_source_invoice_count=p_projected_invoice_count and p_missing_invoice_count=0 and p_extra_invoice_count=0 and p_item_fail_count=0 and p_item_pass_count=p_source_invoice_count and p_cup_expected_count=p_cup_projected_count then 'pass' else 'hold' end;
  insert into public.cing_kds_reconciliation_evidence_p8_v1(reconciliation_key,mapping_key,pos_parent,pos_id,source_invoice_count,projected_invoice_count,missing_invoice_count,extra_invoice_count,item_pass_count,item_fail_count,cup_expected_count,cup_projected_count,source_snapshot_complete,recovery_complete,modifiers_verified,reconciliation_status) values(p_reconciliation_key,p_mapping_key,'BRAND-DQIR','109664',p_source_invoice_count,p_projected_invoice_count,p_missing_invoice_count,p_extra_invoice_count,p_item_pass_count,p_item_fail_count,p_cup_expected_count,p_cup_projected_count,p_source_snapshot_complete,p_recovery_complete,p_modifiers_verified,v_status) on conflict(reconciliation_key) do nothing;
  if found then return query select 'inserted'::text,v_status; return; end if;
  select * into v_row from public.cing_kds_reconciliation_evidence_p8_v1 where reconciliation_key=p_reconciliation_key for update;
  if not found then raise exception 'KDS_P8_ROW_MISSING'; end if;
  if row(v_row.mapping_key,v_row.pos_parent,v_row.pos_id,v_row.source_invoice_count,v_row.projected_invoice_count,v_row.missing_invoice_count,v_row.extra_invoice_count,v_row.item_pass_count,v_row.item_fail_count,v_row.cup_expected_count,v_row.cup_projected_count,v_row.source_snapshot_complete,v_row.recovery_complete,v_row.modifiers_verified,v_row.reconciliation_status) is distinct from row(p_mapping_key,'BRAND-DQIR','109664',p_source_invoice_count,p_projected_invoice_count,p_missing_invoice_count,p_extra_invoice_count,p_item_pass_count,p_item_fail_count,p_cup_expected_count,p_cup_projected_count,p_source_snapshot_complete,p_recovery_complete,p_modifiers_verified,v_status) then raise exception 'KDS_P8_RECONCILIATION_CONFLICT'; end if;
  return query select 'duplicate'::text,v_row.reconciliation_status;
end; $$;
revoke all on function public.cing_kds_reconciliation_record_p8_v1(uuid,uuid,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,boolean,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_reconciliation_record_p8_v1(uuid,uuid,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,boolean,boolean,boolean) to service_role;
commit;
