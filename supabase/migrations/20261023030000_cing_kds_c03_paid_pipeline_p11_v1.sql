-- C03 membership is paid authority by explicit shop-operator policy (2026-10-23).
-- Candidate only. Creates no configuration row, ingestion activation, P9 activation,
-- scheduler, individual grant or operational transition permission.
begin;
do $$ begin
  if to_regprocedure('public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb)') is null
    or to_regclass('public.cing_kds_read_release_gate_p9_v1') is null
    or to_regclass('public.cing_kds_c03_paid_control_p11_v1') is not null then
    raise exception 'KDS_PAID_BASELINE_MISMATCH';
  end if;
  if (select md5(prosrc) from pg_proc where oid='public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb)'::regprocedure)
    is distinct from 'f71aae7946bd9bfda87f20edd9c1f2a1' then
    raise exception 'KDS_PAID_P10_BODY_MISMATCH';
  end if;
  if (select count(*) from pg_constraint where conrelid='public.cing_kds_event_inbox'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%source%' and pg_get_constraintdef(oid) like '%ipos_event_11%')<>1 then
    raise exception 'KDS_PAID_SOURCE_CONSTRAINT_MISMATCH';
  end if;
  if (select count(*) from pg_constraint where conrelid='public.cing_kds_read_release_gate_p9_v1'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%read_enabled%' and pg_get_constraintdef(oid) like '%mapping_key%')<>1 then
    raise exception 'KDS_PAID_P9_CONSTRAINT_MISMATCH';
  end if;
end $$;

create table public.cing_kds_c03_paid_control_p11_v1 (
  policy_key uuid primary key default gen_random_uuid(),
  pos_parent text not null check(pos_parent='BRAND-DQIR'),
  pos_id text not null check(pos_id='109664'),
  company_uid text not null check(company_uid='d1627d1b-4ad8-4c2b-86ff-76d70b9b8cad'),
  brand_uid text not null check(brand_uid='d76e55e9-5b31-48da-987d-d096b8a4793c'),
  store_uid text not null check(store_uid='4aac4b7a-e846-4a40-992a-1cab735c9a4f'),
  policy text not null default 'c03_report_membership_paid_v1' check(policy='c03_report_membership_paid_v1'),
  scope_basis text not null default 'operator_configured_branch' check(scope_basis='operator_configured_branch'),
  -- Explicit operation window. Never silently backfill historical paid bills as
  -- served, and never infer POS timestamps or auto-advance past missing invoices.
  scan_from timestamptz not null,
  enabled boolean not null default false,
  lease_token uuid, lease_until timestamptz, claim_to_ms bigint,
  last_success_at timestamptz, last_error_code text,
  unique(pos_parent,pos_id)
);
create table public.cing_kds_c03_paid_receipts_p11_v1 (
  pos_parent text not null, pos_id text not null, tran_id text not null,
  policy_key uuid not null references public.cing_kds_c03_paid_control_p11_v1(policy_key),
  order_id uuid not null references public.cing_kds_orders(id),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  received_at timestamptz not null default clock_timestamp(),
  primary key(pos_parent,pos_id,tran_id)
);
create table public.cing_kds_c03_paid_cycles_p11_v1 (
  token uuid primary key, policy_key uuid not null references public.cing_kds_c03_paid_control_p11_v1(policy_key),
  source_invoice_count integer not null, inserted_orders integer not null,
  inserted_units integer not null, requests integer not null,
  source_window_to_ms bigint not null,
  committed_at timestamptz not null default clock_timestamp()
);
alter table public.cing_kds_c03_paid_control_p11_v1 enable row level security;
alter table public.cing_kds_c03_paid_receipts_p11_v1 enable row level security;
alter table public.cing_kds_c03_paid_cycles_p11_v1 enable row level security;
revoke all on public.cing_kds_c03_paid_control_p11_v1,public.cing_kds_c03_paid_receipts_p11_v1,
  public.cing_kds_c03_paid_cycles_p11_v1 from public,anon,authenticated,service_role;

-- Preserve real source provenance, rather than calling C03/C04 an Event 11.
do $$ declare v_name text; begin
  select conname into v_name from pg_constraint where conrelid='public.cing_kds_event_inbox'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%source%' and pg_get_constraintdef(oid) like '%ipos_event_11%';
  execute format('alter table public.cing_kds_event_inbox drop constraint %I',v_name);
end $$;
alter table public.cing_kds_event_inbox add constraint cing_kds_inbox_source_p11_check
  check(source in ('ipos_event_11','fabi_c03_paid_v1'));

create function public.cing_kds_paid_ingest_p11_v1(p_operation text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  c public.cing_kds_c03_paid_control_p11_v1%rowtype;
  cycle public.cing_kds_c03_paid_cycles_p11_v1%rowtype;
  v_token uuid; v_order jsonb; v_cup jsonb; v_receipt public.cing_kds_c03_paid_receipts_p11_v1%rowtype;
  v_inbox uuid; v_order_id uuid; v_hash text; v_id text; v_now timestamptz:=clock_timestamp();
  v_orders integer:=0; v_units integer:=0; v_count integer; v_keys integer;
  v_known jsonb; v_snapshot jsonb;
begin
  if p_operation is null or p_operation not in ('status','claim','commit','release') or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'KDS_PAID_INPUT_INVALID';
  end if;
  select * into c from public.cing_kds_c03_paid_control_p11_v1 where pos_parent='BRAND-DQIR' and pos_id='109664' for update;
  if not found or not c.enabled then return jsonb_build_object('outcome','disabled'); end if;
  if p_operation='status' then return jsonb_build_object('outcome','enabled','last_success_at',c.last_success_at,'last_error_code',c.last_error_code); end if;
  begin v_token:=(p_payload->>'token')::uuid; exception when others then raise exception 'KDS_PAID_TOKEN_INVALID'; end;
  if v_token is null then raise exception 'KDS_PAID_TOKEN_INVALID'; end if;
  if p_operation='claim' then
    if c.lease_until>v_now then return jsonb_build_object('outcome','busy'); end if;
    if c.scan_from>v_now-interval '5 seconds' then raise exception 'KDS_PAID_WINDOW_INVALID'; end if;
    select count(*),coalesce(jsonb_agg(r.tran_id order by r.tran_id),'[]'::jsonb) into v_count,v_known
      from public.cing_kds_c03_paid_receipts_p11_v1 r where r.policy_key=c.policy_key;
    if v_count>20000 then raise exception 'KDS_PAID_KNOWN_LIMIT'; end if;
    update public.cing_kds_c03_paid_control_p11_v1 set lease_token=v_token,lease_until=v_now+interval '120 seconds',
      claim_to_ms=floor(extract(epoch from v_now-interval '5 seconds')*1000)::bigint where policy_key=c.policy_key;
    return jsonb_build_object('outcome','claimed','branch',jsonb_build_object('pos_parent',c.pos_parent,'pos_id',c.pos_id),
      'scope',jsonb_build_object('company_uid',c.company_uid,'brand_uid',c.brand_uid,'store_uid',c.store_uid),
      'from_ms',floor(extract(epoch from c.scan_from)*1000)::bigint,'to_ms',floor(extract(epoch from v_now-interval '5 seconds')*1000)::bigint,
      'known_transactions',v_known);
  end if;
  -- Durable receipt replay handles a successful commit whose HTTP response was lost.
  select * into cycle from public.cing_kds_c03_paid_cycles_p11_v1 where token=v_token;
  if found then return jsonb_build_object('outcome','replayed','inserted_orders',cycle.inserted_orders,'inserted_units',cycle.inserted_units); end if;
  if c.lease_token is distinct from v_token or c.lease_until<=clock_timestamp() then raise exception 'KDS_PAID_LEASE_LOST'; end if;
  if p_operation='release' then
    update public.cing_kds_c03_paid_control_p11_v1 set lease_token=null,lease_until=null,
      last_error_code=case when coalesce(p_payload->>'error_code','') ~ '^(KDS_PAID_|C03_|C04_)[A-Z0-9_]+$' then p_payload->>'error_code' else 'KDS_PAID_CYCLE_FAILED' end
      where policy_key=c.policy_key;
    return jsonb_build_object('outcome','released');
  end if;
  if p_payload->'c03_pages_exhausted' is distinct from 'true'::jsonb or
    jsonb_typeof(p_payload->'orders') is distinct from 'array' or jsonb_array_length(p_payload->'orders')>500
    or coalesce(p_payload->>'source_invoice_count','') !~ '^[0-9]{1,5}$'
    or coalesce(p_payload->>'requests','') !~ '^[0-9]{1,3}$' then raise exception 'KDS_PAID_COMMIT_INVALID'; end if;
  if jsonb_array_length(p_payload->'orders')>0 and p_payload->'c04_pages_exhausted' is distinct from 'true'::jsonb then raise exception 'KDS_PAID_HISTORY_INCOMPLETE'; end if;
  if (p_payload->>'source_invoice_count')::integer<jsonb_array_length(p_payload->'orders') then raise exception 'KDS_PAID_COMMIT_INVALID'; end if;
  if pg_column_size(p_payload)>4194304 then raise exception 'KDS_PAID_PAYLOAD_LIMIT'; end if;
  for v_order in select value from jsonb_array_elements(p_payload->'orders') loop
    if jsonb_typeof(v_order) is distinct from 'object' or v_order->>'policy' is distinct from c.policy
      or v_order->>'pos_parent' is distinct from c.pos_parent or v_order->>'pos_id' is distinct from c.pos_id
      or v_order->>'store_uid' is distinct from c.store_uid
      or coalesce(v_order->>'content_hash','') !~ '^[0-9a-f]{64}$'
      or nullif(btrim(v_order->>'tran_id'),'') is null or length(v_order->>'tran_id')>200
      or nullif(btrim(v_order->>'tran_no'),'') is null
      or jsonb_typeof(v_order->'cups') is distinct from 'array' then raise exception 'KDS_PAID_ORDER_INVALID'; end if;
    if exists(select 1 from jsonb_object_keys(v_order) k where k not in
      ('policy','pos_parent','pos_id','store_uid','tran_id','tran_no','pos_name','table_name','source_event_fingerprints','paid_reported_at_ms','source_line_count','total_units','lines','cups','content_hash')) then raise exception 'KDS_PAID_ORDER_FIELDS_INVALID'; end if;
    if coalesce(v_order->>'paid_reported_at_ms','') !~ '^[0-9]{12,16}$' then raise exception 'KDS_PAID_REPORT_TIME_INVALID'; end if;
    if (v_order->>'paid_reported_at_ms')::bigint<946684800000 or (v_order->>'paid_reported_at_ms')::bigint>floor(extract(epoch from clock_timestamp()+interval '5 seconds')*1000)::bigint then raise exception 'KDS_PAID_REPORT_TIME_INVALID'; end if;
    v_id:=v_order->>'tran_id'; v_count:=jsonb_array_length(v_order->'cups');
    if v_count<1 or v_count>1000 or coalesce(v_order->>'total_units','')<>v_count::text then raise exception 'KDS_PAID_CUP_COUNT_INVALID'; end if;
    if exists(select 1 from jsonb_array_elements(v_order->'cups') x where jsonb_typeof(x) is distinct from 'object'
      or nullif(btrim(x->>'unit_key'),'') is null or length(x->>'unit_key')>2000
      or nullif(btrim(x->>'item_id'),'') is null or length(x->>'item_id')>1000
      or nullif(btrim(x->>'item_name'),'') is null or length(x->>'item_name')>4000
      or nullif(btrim(x->>'item_group'),'') is null
      or (x - array['unit_key','item_id','item_name','item_group']::text[])<>'{}'::jsonb) then raise exception 'KDS_PAID_CUP_INVALID'; end if;
    select count(distinct x->>'unit_key') into v_keys from jsonb_array_elements(v_order->'cups') x;
    if v_keys<>v_count then raise exception 'KDS_PAID_DUPLICATE_UNIT'; end if;
    v_hash:=encode(sha256(convert_to((v_order-'content_hash')::text,'UTF8')),'hex');
    select * into v_receipt from public.cing_kds_c03_paid_receipts_p11_v1 where pos_parent=c.pos_parent and pos_id=c.pos_id and tran_id=v_id;
    if found then
      if v_receipt.content_hash<>v_hash then raise exception 'KDS_PAID_EXISTING_CONTENT_CONFLICT'; end if;
      continue;
    end if;
    -- Other ingress lanes must never be overwritten by the new paid pipeline.
    if exists(select 1 from public.cing_kds_event_inbox where pos_parent=c.pos_parent and tran_id=v_id)
      or exists(select 1 from public.cing_kds_orders where pos_parent=c.pos_parent and tran_id=v_id) then raise exception 'KDS_PAID_EXISTING_TRANSACTION_CONFLICT'; end if;
    v_snapshot:=v_order-'content_hash';
    insert into public.cing_kds_event_inbox(source,pos_parent,pos_id,tran_id,fingerprint,event_snapshot,payment_verification,ingestion_status,processed_at)
      values('fabi_c03_paid_v1',c.pos_parent,c.pos_id::bigint,v_id,v_hash,v_snapshot,'verified','processed',v_now) returning id into v_inbox;
    insert into public.cing_kds_orders(pos_parent,pos_id,tran_id,tran_no,pos_name,payment_verification,started_at,tran_date_raw,event_timestamp)
      values(c.pos_parent,c.pos_id::bigint,v_id,v_order->>'tran_no',v_order->>'pos_name','verified',
        to_timestamp((v_order->>'paid_reported_at_ms')::bigint/1000.0),v_order->>'paid_reported_at_ms',to_timestamp((v_order->>'paid_reported_at_ms')::bigint/1000.0)) returning id into v_order_id;
    insert into public.cing_kds_cups(order_id,unit_key,item_id,item_name,item_group)
      select v_order_id,x->>'unit_key',x->>'item_id',x->>'item_name',x->>'item_group' from jsonb_array_elements(v_order->'cups') x;
    insert into public.cing_kds_c03_paid_receipts_p11_v1(pos_parent,pos_id,tran_id,policy_key,order_id,content_hash,payload)
      values(c.pos_parent,c.pos_id,v_id,c.policy_key,v_order_id,v_hash,v_snapshot);
    v_orders:=v_orders+1;v_units:=v_units+v_count;
    if v_units>10000 then raise exception 'KDS_PAID_CYCLE_UNIT_LIMIT'; end if;
  end loop;
  if c.lease_until<=clock_timestamp() then raise exception 'KDS_PAID_LEASE_LOST'; end if;
  insert into public.cing_kds_c03_paid_cycles_p11_v1(token,policy_key,source_invoice_count,inserted_orders,inserted_units,requests,source_window_to_ms)
    values(v_token,c.policy_key,(p_payload->>'source_invoice_count')::integer,v_orders,v_units,(p_payload->>'requests')::integer,c.claim_to_ms);
  update public.cing_kds_c03_paid_control_p11_v1 set lease_token=null,lease_until=null,last_success_at=clock_timestamp(),last_error_code=null where policy_key=c.policy_key;
  return jsonb_build_object('outcome','committed','inserted_orders',v_orders,'inserted_units',v_units);
end $$;
revoke all on function public.cing_kds_paid_ingest_p11_v1(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_paid_ingest_p11_v1(text,jsonb) to service_role;

-- P9 gets an explicit, truthfully labelled operator-policy alternative. Do NOT
-- manufacture source_verified P7 rows or claim historical variant proof.
alter table public.cing_kds_read_release_gate_p9_v1 add column paid_policy_key uuid
  references public.cing_kds_c03_paid_control_p11_v1(policy_key);
do $$ declare v_name text; begin
  select conname into v_name from pg_constraint where conrelid='public.cing_kds_read_release_gate_p9_v1'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%read_enabled%' and pg_get_constraintdef(oid) like '%mapping_key%';
  execute format('alter table public.cing_kds_read_release_gate_p9_v1 drop constraint %I',v_name);
end $$;
alter table public.cing_kds_read_release_gate_p9_v1 add constraint cing_kds_read_evidence_p11_check
  check(not read_enabled or (mapping_key is not null and reconciliation_key is not null) or paid_policy_key is not null);

-- Keep all existing DB-admin/grant/version/SLA authority; only add metadata and
-- source freshness for P11 branches. Legacy P7/P8 branches retain old behaviour.
alter function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) rename to cing_kds_operations_core_p11_v1;
revoke all on function public.cing_kds_operations_core_p11_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.cing_kds_operations_p10_v1(p_admin_id text,p_operation text,p_branch jsonb,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; c public.cing_kds_c03_paid_control_p11_v1%rowtype; v_key uuid;
begin
  -- Core revalidates identity/grants/gate first, on every call.
  result:=public.cing_kds_operations_core_p11_v1(p_admin_id,p_operation,p_branch,p_payload);
  if p_operation in ('snapshot','transition') then
    select paid_policy_key into v_key from public.cing_kds_read_release_gate_p9_v1 where pos_parent=p_branch->>'pos_parent' and pos_id=p_branch->>'pos_id';
    if v_key is not null then
      select * into c from public.cing_kds_c03_paid_control_p11_v1 where policy_key=v_key for share;
      if not found or not c.enabled or c.last_success_at is null or c.last_success_at<clock_timestamp()-interval '90 seconds' then raise exception 'KDS_OPS_SOURCE_STALE'; end if;
      if p_operation='snapshot' then
        result:=jsonb_set(result,'{orders}',coalesce((select jsonb_agg(o || jsonb_build_object('table_name',coalesce(r.payload->>'table_name','')) order by n)
          from jsonb_array_elements(result->'orders') with ordinality as a(o,n)
          left join public.cing_kds_c03_paid_receipts_p11_v1 r on r.order_id::text=o->>'id'),'[]'::jsonb));
        result:=result || jsonb_build_object('source_health',jsonb_build_object('policy',c.policy,'last_success_at',c.last_success_at,
          'scope_basis',c.scope_basis,'sla_clock','c03_report_tran_date_epoch_ms','post_payment_changes','out_of_scope'));
      end if;
    end if;
  end if;
  return result;
end $$;
revoke all on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) to service_role;

-- Release is a separate, owner-only operation after live acceptance. No backend
-- service_role or browser can grant itself reading or transition permission.
create function public.cing_kds_paid_read_release_p11_v1(p_policy_key uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cing_kds_c03_paid_control_p11_v1%rowtype;
begin
  select * into c from public.cing_kds_c03_paid_control_p11_v1 where policy_key=p_policy_key for share;
  if not found or not c.enabled or c.last_success_at is null or c.last_success_at<clock_timestamp()-interval '90 seconds'
    or c.last_error_code is not null then raise exception 'KDS_PAID_RELEASE_NOT_READY'; end if;
  if not exists(select 1 from public.cing_kds_sla_policies where pos_parent=c.pos_parent and pos_id=c.pos_id::bigint and enabled)
    then raise exception 'KDS_PAID_RELEASE_POLICY_REQUIRED'; end if;
  insert into public.cing_kds_read_release_gate_p9_v1(pos_parent,pos_id,paid_policy_key,read_enabled,changed_at)
    values(c.pos_parent,c.pos_id,c.policy_key,true,clock_timestamp())
    on conflict(pos_parent,pos_id) do update set paid_policy_key=excluded.paid_policy_key,read_enabled=true,changed_at=excluded.changed_at;
end $$;
revoke all on function public.cing_kds_paid_read_release_p11_v1(uuid) from public,anon,authenticated,service_role;
commit;
