begin;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb)'::regprocedure)
 is distinct from 'e5e5bb1a30b6738ee4a569f68f75fd61' then raise exception 'KDS_P14_AUTHORITY_CHANGED';end if;
end $$;
create or replace function public.cing_kds_operations_p10_v1(p_admin_id text,p_operation text,p_branch jsonb,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;g public.cing_kds_operations_grants_p10_v1%rowtype;role_name text;is_super boolean;
begin
 if p_operation='snapshot' then
  select role into role_name from public.admins where id::text=p_admin_id and active=true for share;
  is_super:=coalesce(role_name='super_admin',false);
  if not is_super and (p_payload->>'history_from' is not null or p_payload->>'history_to' is not null)
    then raise exception 'KDS_OPS_FORBIDDEN';end if;
 end if;
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
  result:=jsonb_set(result,'{capabilities}',(result->'capabilities')||jsonb_build_object('can_prepare',g.can_prepare,'can_serve',g.can_serve,'can_report',is_super));
  if not is_super then
   -- Only live workflow is visible. Do not return completed history to ordinary admins.
   result:=jsonb_set(result,'{orders}',coalesce((select jsonb_agg(o order by n)
    from jsonb_array_elements(result->'orders') with ordinality as rows(o,n)
    where exists(select 1 from jsonb_array_elements(o->'cups') c where c->>'status'<>'served')),'[]'::jsonb));
   result:=jsonb_set(result,'{history_range}','null'::jsonb);
  end if;
 end if;
 return result;
end $$;
revoke all on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) to service_role;
commit;
