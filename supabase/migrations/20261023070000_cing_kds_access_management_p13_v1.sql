begin;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb)'::regprocedure)
  is distinct from '6d1fc933652f78fb75c37779effa8141' then raise exception 'KDS_P13_OPERATIONS_AUTHORITY_CHANGED';end if;
end $$;
-- Preserve all current rights while splitting preparation and serving permissions.
alter table public.cing_kds_operations_grants_p10_v1 add column can_prepare boolean not null default false;
alter table public.cing_kds_operations_grants_p10_v1 add column can_serve boolean not null default false;
update public.cing_kds_operations_grants_p10_v1 set can_prepare=can_transition,can_serve=can_transition;
create table public.cing_kds_access_audit_p13_v1(
 id uuid primary key default gen_random_uuid(),actor_id text not null,target_admin_id text not null,
 pos_parent text not null,pos_id text not null,previous_grant jsonb,new_grant jsonb not null,
 action_key text not null unique,changed_at timestamptz not null default clock_timestamp());
alter table public.cing_kds_access_audit_p13_v1 enable row level security;
revoke all on public.cing_kds_access_audit_p13_v1 from public,anon,authenticated,service_role;

alter function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) rename to cing_kds_operations_core_p13_v1;
revoke all on function public.cing_kds_operations_core_p13_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.cing_kds_operations_p10_v1(p_admin_id text,p_operation text,p_branch jsonb,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;g public.cing_kds_operations_grants_p10_v1%rowtype;role_name text;
begin
 if p_operation='transition' then
  select * into g from public.cing_kds_operations_grants_p10_v1 where admin_id=p_admin_id
   and pos_parent=p_branch->>'pos_parent' and pos_id=p_branch->>'pos_id' for share;
  if not found or not g.enabled or not g.can_read
   or ((p_payload->>'target_status')='prepared' and not g.can_prepare)
   or ((p_payload->>'target_status')='served' and not g.can_serve)
   or coalesce(p_payload->>'target_status','') not in ('prepared','served') then raise exception 'KDS_OPS_FORBIDDEN';end if;
 end if;
 result:=public.cing_kds_operations_core_p13_v1(p_admin_id,p_operation,p_branch,p_payload);
 if p_operation='snapshot' then
  select * into g from public.cing_kds_operations_grants_p10_v1 where admin_id=p_admin_id
   and pos_parent=p_branch->>'pos_parent' and pos_id=p_branch->>'pos_id' for share;
  result:=jsonb_set(result,'{capabilities}',(result->'capabilities')||jsonb_build_object('can_prepare',g.can_prepare,'can_serve',g.can_serve));
 end if;
 return result;
end $$;
revoke all on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) to service_role;

create function public.cing_kds_access_p13_v1(p_actor_id text,p_operation text,p_branch jsonb,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare target_id text;target_role text;target_active boolean;previous jsonb;desired jsonb;saved jsonb;existing public.cing_kds_access_audit_p13_v1%rowtype;
begin
 -- Actor comes from verified JWT; database role/active status is checked on EVERY call.
 perform 1 from public.admins where id::text=p_actor_id and role='super_admin' and active=true for share;
 if not found then raise exception 'KDS_OPS_FORBIDDEN';end if;
 if p_operation='branches' then
  return jsonb_build_object('branches',coalesce((select jsonb_agg(jsonb_build_object('pos_parent',pos_parent,'pos_id',pos_id))
   from public.cing_kds_c03_paid_control_p11_v1),'[]'::jsonb));
 end if;
 if p_branch->>'pos_parent' is distinct from 'BRAND-DQIR' or p_branch->>'pos_id' is distinct from '109664'
  or p_operation is null or p_operation not in ('list','save') then raise exception 'KDS_OPS_INVALID_INPUT';end if;
 if p_operation='list' then
  if (select count(*) from public.admins)>500 then raise exception 'KDS_OPS_SNAPSHOT_LIMIT';end if;
  return jsonb_build_object('can_manage_access',true,'admins',coalesce((select jsonb_agg(jsonb_build_object(
   'admin_id',a.id::text,'username',a.username,'role',a.role,'active',a.active,
   'grant',jsonb_build_object('can_read',coalesce(g.can_read,false),'can_prepare',coalesce(g.can_prepare,false),
    'can_serve',coalesce(g.can_serve,false),'can_manage_policy',coalesce(g.can_manage_policy,false),'enabled',coalesce(g.enabled,false))
  ) order by a.id) from public.admins a left join public.cing_kds_operations_grants_p10_v1 g
   on g.admin_id=a.id::text and g.pos_parent=p_branch->>'pos_parent' and g.pos_id=p_branch->>'pos_id'),'[]'::jsonb),
   'audit',coalesce((select jsonb_agg(to_jsonb(recent) order by changed_at desc) from
    (select actor_id,target_admin_id,previous_grant,new_grant,changed_at from public.cing_kds_access_audit_p13_v1
     where pos_parent=p_branch->>'pos_parent' and pos_id=p_branch->>'pos_id' order by changed_at desc limit 20) recent),'[]'::jsonb));
 end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or coalesce(p_payload->>'admin_id','')!~'^[0-9]+$'
  or coalesce(p_payload->>'action_key','')!~'^[A-Za-z0-9_-]{16,100}$'
  or jsonb_typeof(p_payload->'grant') is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_payload->'grant'))<>5 then raise exception 'KDS_OPS_INVALID_INPUT';end if;
 foreach target_id in array array['can_read','can_prepare','can_serve','can_manage_policy','enabled'] loop
  if jsonb_typeof(p_payload->'grant'->target_id) is distinct from 'boolean' then raise exception 'KDS_OPS_INVALID_INPUT';end if;
 end loop;
 target_id:=p_payload->>'admin_id';desired:=p_payload->'grant';
 select role,active into target_role,target_active from public.admins where id::text=target_id for share;
 if not found or ((desired->>'enabled')::boolean and not coalesce(target_active,false))
  or ((desired->>'can_manage_policy')::boolean and target_role is distinct from 'super_admin')
  or (not (desired->>'can_read')::boolean and ((desired->>'can_prepare')::boolean or (desired->>'can_serve')::boolean or (desired->>'can_manage_policy')::boolean))
  then raise exception 'KDS_OPS_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended('kds-access:'||(p_branch->>'pos_parent')||':'||(p_branch->>'pos_id'),0));
 select * into existing from public.cing_kds_access_audit_p13_v1 where action_key=p_payload->>'action_key';
 if found then
  if existing.actor_id<>p_actor_id or existing.target_admin_id<>target_id or existing.new_grant<>desired then raise exception 'KDS_OPS_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('outcome','replayed');
 end if;
 select jsonb_build_object('can_read',can_read,'can_prepare',can_prepare,'can_serve',can_serve,'can_manage_policy',can_manage_policy,'enabled',enabled)
  into previous from public.cing_kds_operations_grants_p10_v1 where admin_id=target_id
   and pos_parent=p_branch->>'pos_parent' and pos_id=p_branch->>'pos_id' for update;
 if p_payload->'expected_grant' is distinct from coalesce(previous,jsonb_build_object('can_read',false,'can_prepare',false,'can_serve',false,'can_manage_policy',false,'enabled',false))
  then raise exception 'KDS_OPS_VERSION_CONFLICT';end if;
 insert into public.cing_kds_operations_grants_p10_v1(admin_id,pos_parent,pos_id,can_read,can_transition,can_manage_policy,enabled,can_prepare,can_serve)
 values(target_id,p_branch->>'pos_parent',p_branch->>'pos_id',(desired->>'can_read')::boolean,
  (desired->>'can_prepare')::boolean or (desired->>'can_serve')::boolean,(desired->>'can_manage_policy')::boolean,
  (desired->>'enabled')::boolean,(desired->>'can_prepare')::boolean,(desired->>'can_serve')::boolean)
 on conflict(admin_id,pos_parent,pos_id) do update set can_read=excluded.can_read,can_transition=excluded.can_transition,
  can_manage_policy=excluded.can_manage_policy,enabled=excluded.enabled,can_prepare=excluded.can_prepare,can_serve=excluded.can_serve;
 insert into public.cing_kds_access_audit_p13_v1(actor_id,target_admin_id,pos_parent,pos_id,previous_grant,new_grant,action_key)
 values(p_actor_id,target_id,p_branch->>'pos_parent',p_branch->>'pos_id',previous,desired,p_payload->>'action_key');
 return jsonb_build_object('outcome','saved');
end $$;
revoke all on function public.cing_kds_access_p13_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_access_p13_v1(text,text,jsonb,jsonb) to service_role;
commit;
