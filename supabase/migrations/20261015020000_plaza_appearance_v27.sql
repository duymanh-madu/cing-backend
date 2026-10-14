begin;
create table public.cing_plaza_appearance_items_v27 (
 id text primary key, slot text not null check(slot in ('skin','hair','face','top','bottom','outfit','shoes')),
 label text not null, price_coin bigint not null check(price_coin>=0), enabled boolean not null default false,
 recipe jsonb not null, character text check(character in ('boy','girl')), revision bigint not null default 1
);
create table public.cing_plaza_appearance_owned_v27 (
 member_id uuid references public.customers(id), item_id text references public.cing_plaza_appearance_items_v27(id),
 acquired_at timestamptz not null default now(), primary key(member_id,item_id)
);
create table public.cing_plaza_appearance_equipped_v27 (
 member_id uuid references public.customers(id), slot text not null, item_id text not null,
 primary key(member_id,slot), foreign key(member_id,item_id) references public.cing_plaza_appearance_owned_v27(member_id,item_id)
);
create table public.cing_plaza_appearance_receipts_v27 (
 member_id uuid references public.customers(id), command_id uuid, operation text not null, item_id text not null,
 receipt jsonb not null, created_at timestamptz not null default now(), primary key(member_id,command_id)
);
insert into public.cing_plaza_appearance_items_v27(id,slot,label,price_coin,enabled,recipe) values
 ('skin_white','skin','Da Trắng',30,true,'{"skin":"skin_white"}'),
 ('skin_yellow','skin','Da vàng',30,true,'{"skin":"skin_yellow"}'),
 ('skin_black','skin','Da Đen',30,true,'{"skin":"skin_black"}');
do $$ declare t text; begin
 foreach t in array array['items','owned','equipped','receipts'] loop
 execute format('alter table public.cing_plaza_appearance_%s_v27 enable row level security',t);
 execute format('revoke all on public.cing_plaza_appearance_%s_v27 from public,anon,authenticated,service_role',t);
 execute format('grant select on public.cing_plaza_appearance_%s_v27 to service_role',t);
 end loop;
end $$;
create function public.cing_plaza_appearance_command_v27(p_member_id uuid,p_command_id uuid,p_operation text,p_item_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.cing_plaza_coin_accounts_v16%rowtype; i public.cing_plaza_appearance_items_v27%rowtype;
 old public.cing_plaza_appearance_receipts_v27%rowtype; result jsonb; sex text; phone text; charged bigint:=0;
begin
 if p_member_id is null or p_command_id is null or p_operation not in ('buy_appearance','equip_appearance') then raise exception 'PLAZA_INVALID_REQUEST'; end if;
 if not coalesce((select customer_multiplayer_enabled from public.app_configs where id=1),false) then raise exception 'PLAZA_UNAVAILABLE'; end if;
 select regexp_replace(c.phone,'[^0-9]','','g') into phone from public.customers c where c.id=p_member_id;
 if left(phone,2)='84' then phone:='0'||substr(phone,3); end if;
 if not exists(select 1 from public.players where user_id=phone and is_blocked=false) then raise exception 'PLAZA_MEMBER_BLOCKED'; end if;
 select character into sex from public.cing_plaza_character_profiles_v7 where member_id=p_member_id::text;
 if sex is null then raise exception 'PLAZA_CHARACTER_REQUIRED'; end if;
 insert into public.cing_plaza_coin_accounts_v16(member_id) values(p_member_id) on conflict do nothing;
 select * into a from public.cing_plaza_coin_accounts_v16 where member_id=p_member_id for update;
 select * into old from public.cing_plaza_appearance_receipts_v27 where member_id=p_member_id and command_id=p_command_id;
 if found then
  if old.operation<>p_operation or old.item_id<>p_item_id then raise exception 'PLAZA_COMMAND_CONFLICT'; end if;
  return old.receipt;
 end if;
 -- Hold catalogue row to keep price/publishing consistent through the transaction.
 select * into i from public.cing_plaza_appearance_items_v27 where id=p_item_id for share;
 if not found or (i.character is not null and i.character<>sex) then raise exception 'PLAZA_INVALID_ITEM'; end if;
 if p_operation='buy_appearance' then
  if not exists(select 1 from public.cing_plaza_appearance_owned_v27 where member_id=p_member_id and item_id=p_item_id) then
   if not i.enabled then raise exception 'PLAZA_ITEM_NOT_FOR_SALE'; end if;
   if a.balance<i.price_coin then raise exception 'PLAZA_INSUFFICIENT_COIN'; end if;
   charged:=i.price_coin;
   update public.cing_plaza_coin_accounts_v16 set balance=balance-charged,updated_at=now() where member_id=p_member_id;
   insert into public.cing_plaza_appearance_owned_v27(member_id,item_id) values(p_member_id,p_item_id);
  end if;
 else
  if not exists(select 1 from public.cing_plaza_appearance_owned_v27 where member_id=p_member_id and item_id=p_item_id) then raise exception 'PLAZA_ITEM_NOT_OWNED'; end if;
  insert into public.cing_plaza_appearance_equipped_v27(member_id,slot,item_id) values(p_member_id,i.slot,p_item_id)
  on conflict(member_id,slot) do update set item_id=excluded.item_id;
 end if;
 result:=jsonb_build_object('operation',p_operation,'itemId',p_item_id,'chargedCoin',charged,'coinBefore',a.balance,'coinBalance',a.balance-charged);
 insert into public.cing_plaza_appearance_receipts_v27(member_id,command_id,operation,item_id,receipt) values(p_member_id,p_command_id,p_operation,p_item_id,result);
 return result;
end $$;
revoke all on function public.cing_plaza_appearance_command_v27(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.cing_plaza_appearance_command_v27(uuid,uuid,text,text) to service_role;
commit;
