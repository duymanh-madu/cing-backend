-- C04 admits preparation work. C03 confirms payment separately.
-- Dormant installation: c04_intake_enabled remains false until explicit cutover.
begin;
do $$ declare target record;begin
 for target in select * from (values
 ('cing_kds_operations_core_p11_v1(text,text,jsonb,jsonb)','f71aae7946bd9bfda87f20edd9c1f2a1'),
 ('cing_kds_operations_core_p13_v1(text,text,jsonb,jsonb)','6d1fc933652f78fb75c37779effa8141'),
 ('cing_kds_operations_p10_v1(text,text,jsonb,jsonb)','b715f30bfbcc64931db640e5c8abed38'),
 ('cing_kds_paid_ingest_p11_v1(text,jsonb)','0a35d76fa6a226a34ac13746f7ac7851'),
 ('cing_kds_transition_cup_atomic_v1(uuid,text,text,text,bigint)','e605a229bc104b694746fcf2999a9923')
 ) as expected(signature,digest) loop
 if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.'||target.signature)) is distinct from target.digest
 then raise exception 'KDS_C04_REVIEWED_BASELINE_CHANGED';end if;
 end loop;
end $$;
alter table public.cing_kds_c03_paid_control_p11_v1 add column c04_intake_enabled boolean not null default false,
 add column c04_client_seen_at timestamptz;
alter table public.cing_kds_cups add column c04_cancelled_at timestamptz;
create table public.cing_kds_c04_orders_v1 (
 order_id uuid primary key references public.cing_kds_orders(id),
 policy_key uuid not null references public.cing_kds_c03_paid_control_p11_v1(policy_key),
 pos_parent text not null,pos_id text not null,tran_id text not null,
 inbox_id uuid not null references public.cing_kds_event_inbox(id),
 payload jsonb not null,content_hash text not null,
 paid_confirmed boolean not null default false,updated_at timestamptz not null default clock_timestamp(),
 unique(pos_parent,pos_id,tran_id)
);
create table public.cing_kds_c04_cancellations_v1 (
 id uuid primary key default gen_random_uuid(),cup_id uuid not null references public.cing_kds_cups(id),
 order_id uuid not null references public.cing_kds_orders(id),
 prior_status text not null,prior_version bigint not null,source_hash text not null,
 occurred_at timestamptz not null default clock_timestamp(),unique(cup_id)
);
alter table public.cing_kds_c04_orders_v1 enable row level security;
alter table public.cing_kds_c04_cancellations_v1 enable row level security;
revoke all on public.cing_kds_c04_orders_v1,public.cing_kds_c04_cancellations_v1 from public,anon,authenticated,service_role;
alter table public.cing_kds_event_inbox drop constraint cing_kds_inbox_source_p11_check;
alter table public.cing_kds_event_inbox add constraint cing_kds_inbox_source_c04_check
 check(source in ('ipos_event_11','fabi_c03_paid_v1','fabi_c04_order_v1'));

create function public.cing_kds_c04_admitted_v1(p_order uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.cing_kds_c04_orders_v1 r
 join public.cing_kds_c03_paid_control_p11_v1 c on c.policy_key=r.policy_key
 join public.cing_kds_event_inbox i on i.id=r.inbox_id
 join public.cing_kds_orders o on o.id=r.order_id
 where r.order_id=p_order and c.enabled and c.c04_intake_enabled
 and c.pos_parent=r.pos_parent and c.pos_id=r.pos_id
 and o.pos_parent=r.pos_parent and o.pos_id::text=r.pos_id and o.tran_id=r.tran_id
 and i.pos_parent=r.pos_parent and i.pos_id::text=r.pos_id and i.tran_id=r.tran_id
 and i.source='fabi_c04_order_v1' and i.ingestion_status='processed'
 and not exists(select 1 from public.cing_kds_inbox_conflicts f where f.inbox_id=i.id));
$$;
revoke all on function public.cing_kds_c04_admitted_v1(uuid) from public,anon,authenticated,service_role;

alter function public.cing_kds_paid_ingest_p11_v1(text,jsonb) rename to cing_kds_paid_ingest_core_c04_v1;
revoke all on function public.cing_kds_paid_ingest_core_c04_v1(text,jsonb) from public,anon,authenticated,service_role;
create function public.cing_kds_paid_ingest_p11_v1(p_operation text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 c public.cing_kds_c03_paid_control_p11_v1%rowtype;
 r public.cing_kds_c04_orders_v1%rowtype;old_cup public.cing_kds_cups%rowtype;
 cy public.cing_kds_c03_paid_cycles_p11_v1%rowtype;
 result jsonb;v_order jsonb;v_cup jsonb;v_known jsonb;
 v_token uuid;oid uuid;iid uuid;h text;identity text;v_payment text;
 inserted_orders integer:=0;inserted_units integer:=0;changed_orders integer:=0;
 cancelled_units integer:=0;v_existing boolean;v_previous_count integer;v_at timestamptz:=clock_timestamp();
begin
 select * into c from public.cing_kds_c03_paid_control_p11_v1 where pos_parent='BRAND-DQIR' and pos_id='109664' for update;
 if found and p_operation='claim' and p_payload->>'client_protocol'='c04_order_intake_v1' then
  update public.cing_kds_c03_paid_control_p11_v1 set c04_client_seen_at=clock_timestamp() where policy_key=c.policy_key;
 end if;
 if c.policy_key is null or not c.c04_intake_enabled then
  result:=public.cing_kds_paid_ingest_core_c04_v1(p_operation,p_payload);
  if p_operation='claim' and result->>'outcome'='claimed' then
   select coalesce(jsonb_agg(t.id order by t.id),'[]'::jsonb) into v_known from (
    select value as id from jsonb_array_elements_text(result->'known_transactions')
    union select x.tran_id from public.cing_kds_c04_orders_v1 x where x.policy_key=c.policy_key
   )t;
   if jsonb_array_length(v_known)>20000 then raise exception 'KDS_PAID_KNOWN_LIMIT';end if;
   result:=result||jsonb_build_object('known_transactions',v_known);
  end if;
  return result;
 end if;
 if not c.enabled then return jsonb_build_object('outcome','disabled');end if;
 if p_operation in ('claim','status','release') then
  result:=public.cing_kds_paid_ingest_core_c04_v1(p_operation,p_payload);
  if p_operation='claim' and result->>'outcome'='claimed' then
   select coalesce(jsonb_agg(t.tran_id order by t.tran_id),'[]'::jsonb) into v_known from (
    select x.tran_id from public.cing_kds_c03_paid_receipts_p11_v1 x where x.policy_key=c.policy_key
    union select x.tran_id from public.cing_kds_c04_orders_v1 x where x.policy_key=c.policy_key and x.paid_confirmed
   )t;
   if jsonb_array_length(v_known)>20000 then raise exception 'KDS_PAID_KNOWN_LIMIT';end if;
   result:=result||jsonb_build_object('intake_mode','c04_order_intake_v1','known_transactions',v_known);
  end if;return result;
 end if;
 if p_operation is distinct from 'commit' or jsonb_typeof(p_payload) is distinct from 'object'
  or p_payload->>'intake_mode' is distinct from 'c04_order_intake_v1' then raise exception 'KDS_PAID_LIVE_MODE_REQUIRED';end if;
 begin v_token:=(p_payload->>'token')::uuid;exception when others then raise exception 'KDS_PAID_TOKEN_INVALID';end;
 select * into cy from public.cing_kds_c03_paid_cycles_p11_v1 where token=v_token;
 if found then return jsonb_build_object('outcome','replayed','inserted_orders',cy.inserted_orders,'inserted_units',cy.inserted_units);end if;
 if v_token is null or c.lease_token is distinct from v_token or c.lease_until<=clock_timestamp() then raise exception 'KDS_PAID_LEASE_LOST';end if;
 if p_payload->'c04_pages_exhausted' is distinct from 'true'::jsonb
  or jsonb_typeof(p_payload->'orders') is distinct from 'array' or jsonb_array_length(p_payload->'orders')>500
  or coalesce(p_payload->>'source_invoice_count','') !~ '^[0-9]{1,5}$'
  or coalesce(p_payload->>'requests','') !~ '^[0-9]{1,3}$'
  or pg_column_size(p_payload)>4194304 then raise exception 'KDS_PAID_LIVE_COMMIT_INVALID';end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'orders') x group by x->>'tran_id' having count(*)>1) then raise exception 'KDS_PAID_DUPLICATE_INVOICE';end if;
 for v_order in select value from jsonb_array_elements(p_payload->'orders') loop
  if jsonb_typeof(v_order) is distinct from 'object' or v_order->>'policy' is distinct from 'c04_order_intake_v1'
   or v_order->>'pos_parent' is distinct from c.pos_parent or v_order->>'pos_id' is distinct from c.pos_id
   or v_order->>'store_uid' is distinct from c.store_uid
   or nullif(btrim(v_order->>'tran_id'),'') is null or length(v_order->>'tran_id')>200
   or nullif(btrim(v_order->>'tran_no'),'') is null or length(v_order->>'tran_no')>1000
   or length(v_order->>'table_name')>500
   or v_order->>'payment_verification' not in ('pending_verification','verified')
   or coalesce(v_order->>'started_at_ms','') !~ '^[0-9]{12,16}$'
   or jsonb_typeof(v_order->'cups') is distinct from 'array' or jsonb_array_length(v_order->'cups')>1000
   or jsonb_typeof(v_order->'source_event_fingerprints') is distinct from 'array'
   or jsonb_array_length(v_order->'source_event_fingerprints') not between 1 and 2000
   then raise exception 'KDS_PAID_LIVE_ORDER_INVALID';end if;
  if (v_order-array['policy','pos_parent','pos_id','store_uid','tran_id','tran_no','pos_name','table_name',
    'source_event_fingerprints','started_at_ms','payment_verification','paid_reported_at_ms','lines','cups','total_units','content_hash']::text[])<>'{}'::jsonb
    then raise exception 'KDS_PAID_ORDER_FIELDS_INVALID';end if;
  if (v_order->>'started_at_ms')::bigint<946684800000 or (v_order->>'started_at_ms')::bigint>c.claim_to_ms then raise exception 'KDS_PAID_LIVE_TIME_INVALID';end if;
  if coalesce(v_order->>'total_units','')<>jsonb_array_length(v_order->'cups')::text then raise exception 'KDS_PAID_CUP_COUNT_INVALID';end if;
  if exists(select 1 from jsonb_array_elements_text(v_order->'source_event_fingerprints') x where x !~ '^[0-9a-f]{64}$')
    or (select count(distinct x) from jsonb_array_elements_text(v_order->'source_event_fingerprints') x)<>jsonb_array_length(v_order->'source_event_fingerprints')
    then raise exception 'KDS_PAID_LIVE_EVENT_CONFLICT';end if;
  if exists(select 1 from jsonb_array_elements(v_order->'cups') x where jsonb_typeof(x) is distinct from 'object'
   or nullif(btrim(x->>'unit_key'),'') is null or length(x->>'unit_key')>2000
   or nullif(btrim(x->>'item_id'),'') is null or length(x->>'item_id')>1000
   or nullif(btrim(x->>'item_name'),'') is null or length(x->>'item_name')>4000
   or nullif(btrim(x->>'item_group'),'') is null
   or (x-array['unit_key','item_id','item_name','item_group']::text[])<>'{}'::jsonb)
   then raise exception 'KDS_PAID_CUP_INVALID';end if;
  if (select count(distinct x->>'unit_key') from jsonb_array_elements(v_order->'cups') x)<>jsonb_array_length(v_order->'cups')
   then raise exception 'KDS_PAID_DUPLICATE_UNIT';end if;
  identity:=v_order->>'tran_id';v_payment:=v_order->>'payment_verification';
  if v_payment='verified' and (p_payload->'c03_pages_exhausted' is distinct from 'true'::jsonb
   or coalesce(v_order->>'paid_reported_at_ms','') !~ '^[0-9]{12,16}$') then raise exception 'KDS_PAID_LIVE_PAYMENT_INVALID';end if;
  if v_payment='verified' and ((v_order->>'paid_reported_at_ms')::bigint<946684800000 or (v_order->>'paid_reported_at_ms')::bigint>c.claim_to_ms+5000)
    then raise exception 'KDS_PAID_LIVE_PAYMENT_INVALID';end if;
  h:=encode(sha256(convert_to((v_order-'content_hash')::text,'UTF8')),'hex');
  select * into r from public.cing_kds_c04_orders_v1 where pos_parent=c.pos_parent and pos_id=c.pos_id and tran_id=identity;
  v_existing:=found;
  if v_existing then
   if r.policy_key<>c.policy_key then raise exception 'KDS_PAID_LIVE_SCOPE_CONFLICT';end if;
   if r.paid_confirmed then
    if r.content_hash<>h then raise exception 'KDS_PAID_EXISTING_CONTENT_CONFLICT';end if;continue;
   end if;
   if r.content_hash=h then continue;end if;
   -- Full ordered ledger must retain its committed prefix. Changed or missing
   -- history is held, never converted to new work or mass cancellation.
   v_previous_count:=jsonb_array_length(r.payload->'source_event_fingerprints');
   if jsonb_array_length(v_order->'source_event_fingerprints')<v_previous_count
    or exists(select 1 from generate_series(0,v_previous_count-1) n where
      r.payload->'source_event_fingerprints'->n is distinct from v_order->'source_event_fingerprints'->n)
    or r.payload->>'started_at_ms' is distinct from v_order->>'started_at_ms'
    then raise exception 'KDS_PAID_LIVE_HISTORY_CONFLICT';end if;
   oid:=r.order_id;iid:=r.inbox_id;
   perform 1 from public.cing_kds_event_inbox where id=iid for update;
   perform 1 from public.cing_kds_orders where id=oid for update;
   if exists(select 1 from public.cing_kds_inbox_conflicts where inbox_id=iid) then raise exception 'KDS_PAID_LIVE_HISTORY_CONFLICT';end if;
  else
   if exists(select 1 from public.cing_kds_orders where pos_parent=c.pos_parent and tran_id=identity)
    or exists(select 1 from public.cing_kds_event_inbox where pos_parent=c.pos_parent and tran_id=identity)
    then raise exception 'KDS_PAID_EXISTING_TRANSACTION_CONFLICT';end if;
   insert into public.cing_kds_event_inbox(source,pos_parent,pos_id,tran_id,fingerprint,event_snapshot,payment_verification,ingestion_status,processed_at)
    values('fabi_c04_order_v1',c.pos_parent,c.pos_id::bigint,identity,h,v_order-'content_hash',v_payment,'processed',v_at) returning id into iid;
   insert into public.cing_kds_orders(pos_parent,pos_id,tran_id,tran_no,pos_name,payment_verification,started_at,event_timestamp)
    values(c.pos_parent,c.pos_id::bigint,identity,v_order->>'tran_no',v_order->>'pos_name',v_payment,
    to_timestamp((v_order->>'started_at_ms')::bigint/1000.0),to_timestamp((v_order->>'started_at_ms')::bigint/1000.0)) returning id into oid;
   inserted_orders:=inserted_orders+1;
  end if;
  -- Cup rows are never deleted. Source cancellation is distinct from serving;
  -- prior workflow timestamps/audit remain available, and stale actions lose version.
  for old_cup in select * from public.cing_kds_cups cc where cc.order_id=oid and cc.c04_cancelled_at is null
    and not exists(select 1 from jsonb_array_elements(v_order->'cups') x where x->>'unit_key'=cc.unit_key) for update loop
   if old_cup.version=9223372036854775807 then raise exception 'KDS_PAID_LIVE_VERSION_OVERFLOW';end if;
   insert into public.cing_kds_c04_cancellations_v1(cup_id,order_id,prior_status,prior_version,source_hash)
    values(old_cup.id,oid,old_cup.status,old_cup.version,h);
   update public.cing_kds_cups set c04_cancelled_at=v_at,version=version+1 where id=old_cup.id;
   cancelled_units:=cancelled_units+1;
  end loop;
  for v_cup in select value from jsonb_array_elements(v_order->'cups') loop
   select * into old_cup from public.cing_kds_cups where order_id=oid and unit_key=v_cup->>'unit_key' for update;
   if found then
    if old_cup.item_id is distinct from v_cup->>'item_id' or old_cup.c04_cancelled_at is not null then raise exception 'KDS_PAID_LIVE_UNIT_CONFLICT';end if;
    if old_cup.item_name is distinct from v_cup->>'item_name' or old_cup.item_group is distinct from v_cup->>'item_group' then
     if old_cup.version=9223372036854775807 then raise exception 'KDS_PAID_LIVE_VERSION_OVERFLOW';end if;
     update public.cing_kds_cups set item_name=v_cup->>'item_name',item_group=v_cup->>'item_group',version=version+1 where id=old_cup.id;
    end if;
   else
    insert into public.cing_kds_cups(order_id,unit_key,item_id,item_name,item_group)
     values(oid,v_cup->>'unit_key',v_cup->>'item_id',v_cup->>'item_name',v_cup->>'item_group');
    inserted_units:=inserted_units+1;
   end if;
  end loop;
  update public.cing_kds_event_inbox set event_snapshot=v_order-'content_hash',fingerprint=h,payment_verification=v_payment,processed_at=v_at where id=iid;
  update public.cing_kds_orders set tran_no=v_order->>'tran_no',payment_verification=v_payment,
   tran_date_raw=coalesce(v_order->>'paid_reported_at_ms',tran_date_raw) where id=oid;
  insert into public.cing_kds_c04_orders_v1(order_id,policy_key,pos_parent,pos_id,tran_id,inbox_id,payload,content_hash,paid_confirmed)
   values(oid,c.policy_key,c.pos_parent,c.pos_id,identity,iid,v_order-'content_hash',h,v_payment='verified')
   on conflict(order_id) do update set payload=excluded.payload,content_hash=excluded.content_hash,paid_confirmed=excluded.paid_confirmed,updated_at=v_at;
  changed_orders:=changed_orders+1;
  if inserted_units>10000 or cancelled_units>10000 then raise exception 'KDS_PAID_CYCLE_UNIT_LIMIT';end if;
 end loop;
 if c.lease_until<=clock_timestamp() then raise exception 'KDS_PAID_LEASE_LOST';end if;
 insert into public.cing_kds_c03_paid_cycles_p11_v1(token,policy_key,source_invoice_count,inserted_orders,inserted_units,requests,source_window_to_ms)
 values(v_token,c.policy_key,(p_payload->>'source_invoice_count')::integer,inserted_orders,inserted_units,(p_payload->>'requests')::integer,c.claim_to_ms);
 update public.cing_kds_c03_paid_control_p11_v1 set lease_token=null,lease_until=null,last_success_at=clock_timestamp(),last_error_code=null where policy_key=c.policy_key;
 return jsonb_build_object('outcome','committed','inserted_orders',inserted_orders,'inserted_units',inserted_units,'changed_orders',changed_orders,'cancelled_units',cancelled_units);
end $$;
revoke all on function public.cing_kds_paid_ingest_p11_v1(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_paid_ingest_p11_v1(text,jsonb) to service_role;
-- Extend existing, private DB authority instead of creating a browser/service
-- bypass. Admin identity, grants, gate, freshness, CAS and one-tap rules remain.
do $$ declare src text;begin
 select pg_get_functiondef('public.cing_kds_operations_core_p11_v1(text,text,jsonb,jsonb)'::regprocedure) into src;
 if position('o.payment_verification=''verified''' in src)=0 or position('''payment_verification'',''verified''' in src)=0 then raise exception 'KDS_C04_CORE_BASELINE_CHANGED';end if;
 src:=replace(src,'o.payment_verification=''verified''','(o.payment_verification=''verified'' or public.cing_kds_c04_admitted_v1(o.id))');
 src:=replace(src,'i.payment_verification=''verified''','(i.payment_verification=''verified'' or (i.source=''fabi_c04_order_v1'' and public.cing_kds_c04_admitted_v1(o.id)))');
 src:=replace(src,'where c.id=v_cup','where c.c04_cancelled_at is null and c.id=v_cup');
 src:=replace(src,'where c.order_id=o.id','where c.c04_cancelled_at is null and c.order_id=o.id');
 src:=replace(src,'''payment_verification'',''verified''','''payment_verification'',o.payment_verification,''order_admission_verified'',public.cing_kds_c04_admitted_v1(o.id)');
 execute src;
 select pg_get_functiondef('public.cing_kds_transition_cup_atomic_v1(uuid,text,text,text,bigint)'::regprocedure) into src;
 if position('IF v_payment <> ''verified'' THEN' in src)=0 or position('WHERE c.id = p_cup_id' in src)=0 then raise exception 'KDS_C04_TRANSITION_BASELINE_CHANGED';end if;
 src:=replace(src,'WHERE c.id = p_cup_id','WHERE c.c04_cancelled_at IS NULL AND c.id = p_cup_id');
 src:=replace(src,'IF v_payment <> ''verified'' THEN', 'IF v_payment <> ''verified'' AND NOT EXISTS (SELECT 1 FROM public.cing_kds_cups c WHERE c.id=p_cup_id AND public.cing_kds_c04_admitted_v1(c.order_id)) THEN');
 execute src;
 select pg_get_functiondef('public.cing_kds_operations_core_p13_v1(text,text,jsonb,jsonb)'::regprocedure) into src;
 if position('coalesce(r.payload->>''table_name'','''')' in src)=0 then raise exception 'KDS_C04_METADATA_BASELINE_CHANGED';end if;
 src:=replace(src,'coalesce(r.payload->>''table_name'','''')','coalesce(r.payload->>''table_name'',l.payload->>''table_name'','''')');
 src:=replace(src,'r.order_id::text=o->>''id''','r.order_id::text=o->>''id'' left join public.cing_kds_c04_orders_v1 l on l.order_id::text=o->>''id''');
 src:=replace(src,'''policy'',c.policy','''policy'',case when c.c04_intake_enabled then ''c04_order_intake_v1'' else c.policy end');
 src:=replace(src,'''sla_clock'',''c03_report_tran_date_epoch_ms''','''sla_clock'',case when c.c04_intake_enabled then ''c04_first_order_event'' else ''c03_report_tran_date_epoch_ms'' end');
 execute src;
end $$;
revoke all on function public.cing_kds_operations_core_p11_v1(text,text,jsonb,jsonb),
 public.cing_kds_operations_core_p13_v1(text,text,jsonb,jsonb),
 public.cing_kds_transition_cup_atomic_v1(uuid,text,text,text,bigint) from public,anon,authenticated,service_role;

alter function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) rename to cing_kds_operations_core_c04_v1;
revoke all on function public.cing_kds_operations_core_c04_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.cing_kds_operations_p10_v1(p_admin_id text,p_operation text,p_branch jsonb,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;v_cancel jsonb;begin
 -- Match ingress lock order: paid-control, inbox, order, cup. This avoids
 -- an operator holding a cup while waiting on the source worker's control lock.
 if p_operation in ('snapshot','transition') then
  perform 1 from public.cing_kds_c03_paid_control_p11_v1 c where c.pos_parent=p_branch->>'pos_parent' and c.pos_id=p_branch->>'pos_id' for share;
 end if;
 -- P14 database role and all P10-P13 branch/transition permissions run first.
 result:=public.cing_kds_operations_core_c04_v1(p_admin_id,p_operation,p_branch,p_payload);
 if p_operation='snapshot' then
  select coalesce(jsonb_agg(v.data order by v.occurred_at desc),'[]'::jsonb) into v_cancel from (
   select jsonb_build_object('cup_id',cc.id,'order_id',o.id,'tran_no',o.tran_no,'item_name',cc.item_name,
    'prior_status',a.prior_status,'occurred_at',a.occurred_at) as data,a.occurred_at
   from public.cing_kds_c04_cancellations_v1 a join public.cing_kds_orders o on o.id=a.order_id
   join public.cing_kds_cups cc on cc.id=a.cup_id
   where o.pos_parent=p_branch->>'pos_parent' and o.pos_id::text=p_branch->>'pos_id'
   and a.occurred_at>clock_timestamp()-interval '30 minutes' order by a.occurred_at desc limit 50
  ) v;
  result:=result||jsonb_build_object('source_cancellations',v_cancel);
 end if;return result;
end $$;
revoke all on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) to service_role;
commit;
