-- CING KDS R3/P4. SOURCE REVIEW ONLY. NOT AUTHORIZED FOR PRODUCTION EXECUTION.
begin;
do $$
declare v_name text; v_count integer; v_rls boolean;
begin
  foreach v_name in array array['cing_kds_fabi_c04_event_inbox','cing_kds_fabi_runtime_branch_v1','cing_kds_fabi_reconciliation_queue_v1'] loop
    if to_regclass('public.'||v_name) is null then raise exception 'KDS_P4_REQUIRED_TABLE_MISSING:%',v_name; end if;
    select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=v_name;
    if v_rls is distinct from true or has_table_privilege('anon','public.'||v_name,'select') or has_table_privilege('authenticated','public.'||v_name,'select') or has_table_privilege('service_role','public.'||v_name,'select') then raise exception 'KDS_P4_DIRECT_TABLE_ACCESS:%',v_name; end if;
  end loop;
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cing_kds_fabi_c04_event_inbox_put_v1','cing_kds_fabi_c04_event_inbox_load_tran_v1','cing_kds_fabi_runtime_lease_acquire_v1','cing_kds_fabi_runtime_checkpoint_commit_v1','cing_kds_fabi_runtime_lease_renew_v1','cing_kds_fabi_runtime_lease_release_v1','cing_kds_fabi_reconciliation_result_put_v1','cing_kds_fabi_reconciliation_claim_due_v1','cing_kds_fabi_reconciliation_resolve_claim_v1');
  if v_count <> 9 then raise exception 'KDS_P4_RPC_SURFACE_DRIFT'; end if;
end; $$;
revoke all on function public.cing_kds_fabi_c04_event_inbox_put_v1(text,text,text,text,text,text,text,text,text,numeric,numeric,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_runtime_lease_acquire_v1(text,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_runtime_checkpoint_commit_v1(text,text,text,uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_runtime_lease_renew_v1(text,text,text,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_runtime_lease_release_v1(text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_reconciliation_result_put_v1(text,text,text,text,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_reconciliation_claim_due_v1(text,text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.cing_kds_fabi_reconciliation_resolve_claim_v1(text,text,text,text,uuid,bigint,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_fabi_c04_event_inbox_put_v1(text,text,text,text,text,text,text,text,text,numeric,numeric,jsonb) to service_role;
grant execute on function public.cing_kds_fabi_c04_event_inbox_load_tran_v1(text,text,text,text) to service_role;
grant execute on function public.cing_kds_fabi_runtime_lease_acquire_v1(text,text,text,integer) to service_role;
grant execute on function public.cing_kds_fabi_runtime_checkpoint_commit_v1(text,text,text,uuid,bigint) to service_role;
grant execute on function public.cing_kds_fabi_runtime_lease_renew_v1(text,text,text,uuid,integer) to service_role;
grant execute on function public.cing_kds_fabi_runtime_lease_release_v1(text,text,text,uuid) to service_role;
grant execute on function public.cing_kds_fabi_reconciliation_result_put_v1(text,text,text,text,text,text,integer) to service_role;
grant execute on function public.cing_kds_fabi_reconciliation_claim_due_v1(text,text,text,integer,integer) to service_role;
grant execute on function public.cing_kds_fabi_reconciliation_resolve_claim_v1(text,text,text,text,uuid,bigint,text,text,integer) to service_role;
commit;
