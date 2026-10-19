-- ============================================================
-- CING KDS Pro — Production Adoption Guard V1 (P0)
-- SOURCE REVIEW ONLY. DO NOT EXECUTE WITHOUT A NEW EXPLICIT
-- PRODUCTION AUTHORIZATION AND CHECKSUM RECORD.
--
-- This does not create an ingestion writer, runtime lease, queue,
-- scheduler, webhook, or KDS-ready authority. It only adopts the
-- already-contained empty draft baseline after fail-closed checks.
-- ============================================================

begin;

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
      raise exception 'KDS_P0_REQUIRED_TABLE_MISSING:%', v_table_name;
    end if;

    select c.relrowsecurity
      into v_rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = v_table_name;

    if v_rls_enabled is distinct from true then
      raise exception 'KDS_P0_RLS_REQUIRED:%', v_table_name;
    end if;

    execute format('select count(*) from public.%I', v_table_name)
      into v_row_count;

    if v_row_count <> 0 then
      raise exception 'KDS_P0_TABLE_NOT_EMPTY:%', v_table_name;
    end if;

    if has_table_privilege('anon', 'public.' || v_table_name, 'select')
       or has_table_privilege('authenticated', 'public.' || v_table_name, 'select')
       or has_table_privilege('service_role', 'public.' || v_table_name, 'select') then
      raise exception 'KDS_P0_DIRECT_TABLE_ACCESS:%', v_table_name;
    end if;
  end loop;

  select count(*)
    into v_function_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'cing_kds_receive_event11_atomic_v1';

  if v_function_count <> 1 then
    raise exception 'KDS_P0_INGESTION_FUNCTION_MISSING';
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
    raise exception 'KDS_P0_INGESTION_FUNCTION_EXECUTE';
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
    raise exception 'KDS_P0_TRIGGER_PRESENT';
  end if;

  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'cing_kds_fabi_c04_event_inbox',
         'cing_kds_fabi_runtime_branch_v1',
         'cing_kds_fabi_reconciliation_queue_v1'
       )
  ) then
    raise exception 'KDS_P0_UNAPPROVED_TABLE_PRESENT';
  end if;
end;
$$;

create table public.cing_kds_production_adoption_v1 (
  adoption_key text primary key
    check (adoption_key = 'kds_r2_contained_draft_baseline_v1'),
  preflight_sha256 text not null
    check (preflight_sha256 ~ '^[a-f0-9]{64}$'),
  adopted_at timestamptz not null default clock_timestamp(),
  adopted_by text not null default current_user
    check (length(btrim(adopted_by)) > 0)
);

alter table public.cing_kds_production_adoption_v1
enable row level security;

revoke all on table public.cing_kds_production_adoption_v1
from public, anon, authenticated, service_role;

insert into public.cing_kds_production_adoption_v1 (
  adoption_key,
  preflight_sha256
)
values (
  'kds_r2_contained_draft_baseline_v1',
  '03f49bd10dbd7f41b7c234bf2914e635217443fe2e65ce7e721287b6c56c45b6'
);

commit;
