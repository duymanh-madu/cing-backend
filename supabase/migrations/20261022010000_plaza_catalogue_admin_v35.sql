begin;
create table if not exists public.cing_plaza_catalogue_audit_v35(
 command_id uuid primary key,admin_id text not null,item_id text not null,price_coin bigint not null,enabled boolean not null,
 expected_revision bigint not null,reason text not null,before_value jsonb not null,after_value jsonb not null,created_at timestamptz not null default now()
);
create table if not exists public.cing_plaza_fashion_release_v35(release text primary key,created_at timestamptz not null default now());
alter table public.cing_plaza_catalogue_audit_v35 enable row level security;
alter table public.cing_plaza_fashion_release_v35 enable row level security;
revoke all on public.cing_plaza_catalogue_audit_v35,public.cing_plaza_fashion_release_v35 from public,anon,authenticated,service_role;
create or replace function public.cing_plaza_catalogue_admin_set_v35(p_admin_id text,p_item_id text,p_price_coin bigint,p_enabled boolean,p_expected_revision bigint,p_reason text,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare old public.cing_plaza_appearance_items_v27; receipt public.cing_plaza_catalogue_audit_v35; result jsonb;
begin
 if not exists(select 1 from public.admins where id::text=p_admin_id and role='super_admin' and active=true) then raise exception 'PLAZA_SUPER_ADMIN_REQUIRED';end if;
 if p_command_id is null or p_price_coin is null or p_price_coin<0 or p_price_coin>1000000 or p_enabled is null or p_expected_revision is null or p_expected_revision<1 or p_reason is null or length(trim(p_reason))<5 or length(p_reason)>500 then raise exception 'PLAZA_INVALID_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
 select * into receipt from public.cing_plaza_catalogue_audit_v35 where command_id=p_command_id;
 if found then
  if receipt.admin_id<>p_admin_id or receipt.item_id<>p_item_id or receipt.price_coin<>p_price_coin or receipt.enabled<>p_enabled or receipt.expected_revision<>p_expected_revision or receipt.reason<>p_reason then raise exception 'PLAZA_COMMAND_CONFLICT';end if;
  return receipt.after_value;
 end if;
 select * into old from public.cing_plaza_appearance_items_v27 where id=p_item_id for update;
 if not found or old.id like '%\_default\_%' escape '\' or old.slot='outfit' then raise exception 'PLAZA_INVALID_ITEM';end if;
 if old.revision<>p_expected_revision then raise exception 'PLAZA_CATALOGUE_CONFLICT';end if;
 update public.cing_plaza_appearance_items_v27 set price_coin=p_price_coin,enabled=p_enabled,revision=revision+1 where id=p_item_id returning to_jsonb(cing_plaza_appearance_items_v27.*) into result;
 insert into public.cing_plaza_catalogue_audit_v35(command_id,admin_id,item_id,price_coin,enabled,expected_revision,reason,before_value,after_value)
 values(p_command_id,p_admin_id,p_item_id,p_price_coin,p_enabled,p_expected_revision,p_reason,to_jsonb(old),result);
 return result;
end;$$;
revoke all on function public.cing_plaza_catalogue_admin_set_v35(text,text,bigint,boolean,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.cing_plaza_catalogue_admin_set_v35(text,text,bigint,boolean,bigint,text,uuid) to service_role;
-- Restore original parts without revoking purchased fashion.
insert into public.cing_plaza_appearance_items_v27(id,slot,label,price_coin,enabled,recipe,character) values
('boy_default_outfit','outfit','Bộ đồ gốc',0,true,'{"outfit":"boy_default_outfit"}'::jsonb,'boy'),
('boy_default_top','top','Áo gốc',0,true,'{"top":"boy_default_top"}'::jsonb,'boy'),
('boy_default_bottom','bottom','Quần / váy gốc',0,true,'{"bottom":"boy_default_bottom"}'::jsonb,'boy'),
('boy_default_shoes','shoes','Giày gốc',0,true,'{"shoes":"boy_default_shoes"}'::jsonb,'boy'),
('girl_default_outfit','outfit','Bộ đồ gốc',0,true,'{"outfit":"girl_default_outfit"}'::jsonb,'girl'),
('girl_default_top','top','Áo gốc',0,true,'{"top":"girl_default_top"}'::jsonb,'girl'),
('girl_default_bottom','bottom','Quần / váy gốc',0,true,'{"bottom":"girl_default_bottom"}'::jsonb,'girl'),
('girl_default_shoes','shoes','Giày gốc',0,true,'{"shoes":"girl_default_shoes"}'::jsonb,'girl') on conflict(id) do nothing;
do $patch$ declare source text; anchor text := 'insert into public.cing_plaza_appearance_equipped_v27(member_id,slot,item_id) values(p_member_id,i.slot,p_item_id)'; begin
 source:=pg_get_functiondef('public.cing_plaza_appearance_command_v27(uuid,uuid,text,text)'::regprocedure);
 if position('V35_ORIGINAL_OUTFIT' in source)=0 and position('V29_FULL_OUTFIT' in source)=0 then
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then raise exception 'V35_SOURCE_GUARD_MISMATCH'; end if;
 source:=replace(source,anchor,E'  -- V35_ORIGINAL_OUTFIT: reset clothing slots together, preserve skin.
  if i.slot=''outfit'' then delete from public.cing_plaza_appearance_equipped_v27 where member_id=p_member_id and slot in (''top'',''bottom'',''shoes''); end if;
'||anchor);
 execute source; end if; end $patch$;
-- First publication only. Re-running never resets Super Admin's subsequent decisions.
do $seed$ begin
 insert into public.cing_plaza_fashion_release_v35(release) values('v34') on conflict do nothing;
 if found then
 insert into public.cing_plaza_appearance_items_v27(id,slot,label,price_coin,enabled,recipe,character) values
('boy_campus_top','top','Campus Club · Áo',50,true,'{"top":"boy_campus_top"}'::jsonb,'boy'),
('boy_campus_bottom','bottom','Campus Club · Quần',50,true,'{"bottom":"boy_campus_bottom"}'::jsonb,'boy'),
('boy_campus_shoes','shoes','Campus Club · Giày',50,true,'{"shoes":"boy_campus_shoes"}'::jsonb,'boy'),
('boy_royal_top','top','Royal Evening · Áo',50,true,'{"top":"boy_royal_top"}'::jsonb,'boy'),
('boy_royal_bottom','bottom','Royal Evening · Quần',50,true,'{"bottom":"boy_royal_bottom"}'::jsonb,'boy'),
('boy_royal_shoes','shoes','Royal Evening · Giày',50,true,'{"shoes":"boy_royal_shoes"}'::jsonb,'boy'),
('boy_street_top','top','Street Violet · Áo',50,true,'{"top":"boy_street_top"}'::jsonb,'boy'),
('boy_street_bottom','bottom','Street Violet · Quần',50,true,'{"bottom":"boy_street_bottom"}'::jsonb,'boy'),
('boy_street_shoes','shoes','Street Violet · Giày',50,true,'{"shoes":"boy_street_shoes"}'::jsonb,'boy'),
('girl_campus_top','top','Campus Club · Áo',50,true,'{"top":"girl_campus_top"}'::jsonb,'girl'),
('girl_campus_bottom','bottom','Campus Club · Váy',50,true,'{"bottom":"girl_campus_bottom"}'::jsonb,'girl'),
('girl_campus_shoes','shoes','Campus Club · Giày',50,true,'{"shoes":"girl_campus_shoes"}'::jsonb,'girl'),
('girl_royal_top','top','Royal Evening · Áo',50,true,'{"top":"girl_royal_top"}'::jsonb,'girl'),
('girl_royal_bottom','bottom','Royal Evening · Váy',50,true,'{"bottom":"girl_royal_bottom"}'::jsonb,'girl'),
('girl_royal_shoes','shoes','Royal Evening · Giày',50,true,'{"shoes":"girl_royal_shoes"}'::jsonb,'girl'),
('girl_street_top','top','Street Violet · Áo',50,true,'{"top":"girl_street_top"}'::jsonb,'girl'),
('girl_street_bottom','bottom','Street Violet · Quần',50,true,'{"bottom":"girl_street_bottom"}'::jsonb,'girl'),
('girl_street_shoes','shoes','Street Violet · Giày',50,true,'{"shoes":"girl_street_shoes"}'::jsonb,'girl')
 on conflict(id) do update set label=excluded.label,price_coin=50,enabled=true,recipe=excluded.recipe,character=excluded.character,revision=cing_plaza_appearance_items_v27.revision+1;
 end if;
end $seed$;
commit;
select id,label,price_coin,enabled,revision from public.cing_plaza_appearance_items_v27 where id ~ '^(boy|girl)_(campus|royal|street)_(top|bottom|shoes)$' order by id;
