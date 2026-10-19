-- CING KDS Recovery R2 — Production adoption preflight
-- READ-ONLY / NO DDL / NO DML / NO GRANT / NO REVOKE
-- This does not authorize a migration or a runtime.

do $$
declare
  v_table_name text;
  v_row_count bigint;
  v_rls_enabled boolean;
  v_function_oid oid;
  v_function_count integer;
begin
  foreach v_table_name in array array[
    'cing_kds_orders',
    'cing_kds_cups',
    'cing_kds_cup_audit',
    'cing_kds_sla_policies',
    'cing_kds_alerts',
    'cing_kds_event_inbox',
    'cing_kds_inbox_conflicts'
  ] loop
    if to_regclass('public.' || v_table_name) is null then
      raise exception 'KDS_R2_PREFLIGHT_REQUIRED_TABLE_MISSING:%', v_table_name;
    end if;

    select c.relrowsecurity
      into v_rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = v_table_name;

    if v_rls_enabled is distinct from true then
      raise exception 'KDS_R2_PREFLIGHT_RLS_REQUIRED:%', v_table_name;
    end if;

    execute format('select count(*) from public.%I', v_table_name)
      into v_row_count;

    if v_row_count <> 0 then
      raise exception 'KDS_R2_PREFLIGHT_TABLE_NOT_EMPTY:%', v_table_name;
    end if;

    if has_table_privilege('anon', 'public.' || v_table_name, 'select')
       or has_table_privilege('authenticated', 'public.' || v_table_name, 'select')
       or has_table_privilege('service_role', 'public.' || v_table_name, 'select') then
      raise exception 'KDS_R2_PREFLIGHT_DIRECT_TABLE_ACCESS:%', v_table_name;
    end if;
  end loop;

  select count(*)
    into v_function_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'cing_kds_receive_event11_atomic_v1';

  if v_function_count <> 1 then
    raise exception 'KDS_R2_PREFLIGHT_INGESTION_FUNCTION_MISSING';
  end if;

  select p.oid
    into v_function_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'cing_kds_receive_event11_atomic_v1';

  if has_function_privilege('anon', v_function_oid, 'execute')
     or has_function_privilege('authenticated', v_function_oid, 'execute')
     or has_function_privilege('service_role', v_function_oid, 'execute') then
    raise exception 'KDS_R2_PREFLIGHT_INGESTION_FUNCTION_EXECUTE';
  end if;

  if exists (
    select 1
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname like 'cing_kds_%'
       and not tg.tgisinternal
  ) then
    raise exception 'KDS_R2_PREFLIGHT_KDS_TRIGGER_PRESENT';
  end if;

  foreach v_table_name in array array[
    'cing_kds_fabi_c04_event_inbox',
    'cing_kds_fabi_runtime_branch_v1',
    'cing_kds_fabi_reconciliation_queue_v1'
  ] loop
    if to_regclass('public.' || v_table_name) is not null then
      raise exception 'KDS_R2_PREFLIGHT_UNAPPROVED_TABLE_PRESENT:%', v_table_name;
    end if;
  end loop;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'cing_kds_transition_cup_atomic_v1',
         'cing_kds_materialize_inbox_atomic_v1',
         'cing_kds_fabi_c04_event_inbox_put_v1',
         'cing_kds_fabi_c04_event_inbox_load_tran_v1',
         'cing_kds_fabi_runtime_lease_acquire_v1',
         'cing_kds_fabi_runtime_checkpoint_commit_v1',
         'cing_kds_fabi_runtime_lease_renew_v1',
         'cing_kds_fabi_runtime_lease_release_v1',
         'cing_kds_fabi_reconciliation_result_put_v1',
         'cing_kds_fabi_reconciliation_claim_due_v1',
         'cing_kds_fabi_reconciliation_resolve_claim_v1'
       )
  ) then
    raise exception 'KDS_R2_PREFLIGHT_UNAPPROVED_FUNCTION_PRESENT';
  end if;

  raise notice 'KDS_R2_PREFLIGHT_PASS: contained draft baseline matches Recovery R1';
end;
$$;
