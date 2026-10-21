-- CING KDS P9 read-release gate candidate. SOURCE ONLY: DO NOT EXECUTE WITHOUT NEW PRODUCTION AUTHORIZATION.
begin;
do $$
begin
  if to_regclass('public.cing_kds_reconciliation_evidence_p8_v1') is null then raise exception 'KDS_P9_P8_REQUIRED'; end if;
  if to_regclass('public.cing_kds_read_release_gate_p9_v1') is not null then raise exception 'KDS_P9_TABLE_ALREADY_PRESENT'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cing_kds_read_release_gate_set_p9_v1','cing_kds_read_release_gate_load_p9_v1')) then raise exception 'KDS_P9_FUNCTION_ALREADY_PRESENT'; end if;
end; $$;

create table public.cing_kds_read_release_gate_p9_v1 (
  pos_parent text not null check(pos_parent='BRAND-DQIR'), pos_id text not null check(pos_id='109664'),
  mapping_key uuid null references public.cing_kds_source_mapping_evidence_p7_v1(mapping_key), reconciliation_key uuid null references public.cing_kds_reconciliation_evidence_p8_v1(reconciliation_key),
  read_enabled boolean not null default false, changed_at timestamptz not null default clock_timestamp(),
  primary key(pos_parent,pos_id), check((read_enabled=false) or (mapping_key is not null and reconciliation_key is not null))
);
alter table public.cing_kds_read_release_gate_p9_v1 enable row level security;
revoke all on table public.cing_kds_read_release_gate_p9_v1 from public,anon,authenticated,service_role;

create function public.cing_kds_read_release_gate_set_p9_v1(p_pos_parent text,p_pos_id text,p_mapping_key uuid,p_reconciliation_key uuid,p_read_enabled boolean)
returns table(read_enabled boolean)
language plpgsql security definer set search_path=public,pg_catalog,pg_temp as $$
declare v_mapping public.cing_kds_source_mapping_evidence_p7_v1%rowtype; v_reconciliation public.cing_kds_reconciliation_evidence_p8_v1%rowtype;
begin
  if nullif(btrim(p_pos_parent),'') is distinct from 'BRAND-DQIR' or nullif(btrim(p_pos_id),'') is distinct from '109664' or p_read_enabled is null then raise exception 'KDS_P9_TARGET_INVALID'; end if;
  if p_read_enabled then
    if p_mapping_key is null or p_reconciliation_key is null then raise exception 'KDS_P9_EVIDENCE_REQUIRED'; end if;
    select * into v_mapping from public.cing_kds_source_mapping_evidence_p7_v1 where mapping_key=p_mapping_key for key share;
    select * into v_reconciliation from public.cing_kds_reconciliation_evidence_p8_v1 where reconciliation_key=p_reconciliation_key for key share;
    if not found or v_mapping.mapping_status<>'source_verified' or v_reconciliation.mapping_key<>p_mapping_key or v_reconciliation.reconciliation_status<>'pass' or not v_reconciliation.source_snapshot_complete or not v_reconciliation.recovery_complete or not v_reconciliation.modifiers_verified then raise exception 'KDS_P9_EVIDENCE_INCOMPLETE'; end if;
  end if;
  insert into public.cing_kds_read_release_gate_p9_v1(pos_parent,pos_id,mapping_key,reconciliation_key,read_enabled,changed_at) values('BRAND-DQIR','109664',p_mapping_key,p_reconciliation_key,p_read_enabled,clock_timestamp()) on conflict(pos_parent,pos_id) do update set mapping_key=excluded.mapping_key,reconciliation_key=excluded.reconciliation_key,read_enabled=excluded.read_enabled,changed_at=excluded.changed_at;
  return query select p_read_enabled;
end; $$;

create function public.cing_kds_read_release_gate_load_p9_v1(p_pos_parent text,p_pos_id text)
returns table(pos_parent text,pos_id text,read_enabled boolean)
language sql security definer set search_path=public,pg_catalog,pg_temp as $$
  select g.pos_parent,g.pos_id,g.read_enabled from public.cing_kds_read_release_gate_p9_v1 g where g.pos_parent=nullif(btrim(p_pos_parent),'') and g.pos_id=nullif(btrim(p_pos_id),'')
$$;
revoke all on function public.cing_kds_read_release_gate_set_p9_v1(text,text,uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_read_release_gate_load_p9_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_read_release_gate_set_p9_v1(text,text,uuid,uuid,boolean) to service_role;
grant execute on function public.cing_kds_read_release_gate_load_p9_v1(text,text) to service_role;
commit;
