-- Cing Plaza V16. Run only after the accompanying read-only preflight passes.
-- All amounts are integer Coin, 1 Coin = 1000 VND. A loudspeaker costs 3 Coin.
begin;
do $$ begin
 if to_regprocedure('public.cing_wallet_apply_mutation_private(text,text,bigint,text,text,text,text,text,text,text,jsonb)') is null
 then raise exception 'PLAZA_WALLET_AUTHORITY_REQUIRED'; end if;
 if to_regclass('public.cing_plaza_character_profiles_v7') is null then raise exception 'PLAZA_CHARACTER_AUTHORITY_REQUIRED'; end if;
end $$;
create table public.cing_plaza_social_profiles_v16 (
 member_id uuid primary key references public.customers(id), bio text not null default '' check(char_length(bio)<=200),
 avatar_key text, revision bigint not null default 1, updated_at timestamptz not null default now()
);
create table public.cing_plaza_coin_accounts_v16 (
 member_id uuid primary key references public.customers(id), balance bigint not null default 0 check(balance>=0),
 loudspeakers bigint not null default 0 check(loudspeakers>=0), updated_at timestamptz not null default now()
);
create table public.cing_plaza_commands_v16 (
 member_id uuid not null references public.customers(id), command_id uuid not null,
 operation text not null, payload jsonb not null, receipt jsonb not null, created_at timestamptz not null default now(), primary key(member_id,command_id)
);
create table public.cing_plaza_coin_ledger_v16 (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.customers(id), command_id uuid not null,
 operation text not null check(operation in ('convert','buy_loudspeaker','use_loudspeaker')),
 coin_delta bigint not null, coin_before bigint not null, coin_after bigint not null,
 item_delta bigint not null, item_before bigint not null, item_after bigint not null,
 price_vnd bigint not null default 0, unit_coin_price integer not null default 0,
 created_at timestamptz not null default now(), unique(member_id,command_id)
);
create table public.cing_plaza_friendships_v16 (
 low_id uuid not null references public.customers(id), high_id uuid not null references public.customers(id),
 requester_id uuid not null references public.customers(id), status text not null check(status in ('pending','accepted')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(low_id,high_id), check(low_id<high_id)
);
create table public.cing_plaza_blocks_v16 (
 member_id uuid not null references public.customers(id), blocked_id uuid not null references public.customers(id),
 created_at timestamptz not null default now(), primary key(member_id,blocked_id), check(member_id<>blocked_id)
);
create table public.cing_plaza_messages_v16 (
 id uuid primary key default gen_random_uuid(), seq bigint generated always as identity unique,
 channel text not null check(channel in ('world','pm')), author_id uuid not null references public.customers(id),
 recipient_id uuid references public.customers(id), author_name text not null, author_badge text,
 body text not null check(char_length(body) between 1 and 500), created_at timestamptz not null default now(),
 check((channel='world' and recipient_id is null) or (channel='pm' and recipient_id is not null and recipient_id<>author_id))
);
create index cing_plaza_world_feed_v16 on public.cing_plaza_messages_v16(seq desc) where channel='world';
create index cing_plaza_pm_inbox_v16 on public.cing_plaza_messages_v16(recipient_id,seq desc) where channel='pm';
create index cing_plaza_pm_sent_v16 on public.cing_plaza_messages_v16(author_id,seq desc) where channel='pm';
create table public.cing_plaza_notifications_v16 (
 id uuid primary key default gen_random_uuid(), seq bigint generated always as identity unique,
 member_id uuid not null references public.customers(id), event_name text not null, created_at timestamptz not null default now()
);
create index cing_plaza_notifications_member_v16 on public.cing_plaza_notifications_v16(member_id,seq desc);
create table public.cing_plaza_activity_v16 (
 id uuid primary key default gen_random_uuid(), event_id uuid not null unique,
 member_id uuid references public.customers(id), event_name text not null,
 room_id text, room_name text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index cing_plaza_activity_time_v16 on public.cing_plaza_activity_v16(created_at desc,id desc);
create index cing_plaza_activity_member_v16 on public.cing_plaza_activity_v16(member_id,created_at desc);
-- No client grants or RLS policies. Only the authenticated backend's service role may use the RPC.
do $$ declare t text; begin
 foreach t in array array['social_profiles','coin_accounts','commands','coin_ledger','friendships','blocks','messages','activity','notifications'] loop
 execute format('alter table public.cing_plaza_%s_v16 enable row level security',t);
 execute format('revoke all on public.cing_plaza_%s_v16 from public,anon,authenticated',t);
 execute format('revoke all on public.cing_plaza_%s_v16 from service_role',t);
 execute format('grant select on public.cing_plaza_%s_v16 to service_role',t);
 end loop;
end $$;
grant insert on public.cing_plaza_activity_v16 to service_role;
grant usage,select on sequence public.cing_plaza_messages_v16_seq_seq,public.cing_plaza_notifications_v16_seq_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cing-plaza-avatars-v16','cing-plaza-avatars-v16',false,262144,array['image/jpeg']) on conflict(id) do nothing;

create function public.cing_plaza_social_command_v16(p_member_id uuid,p_operation text,p_command_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_phone text; v_name text; v_badge text; v_peer uuid; v_low uuid; v_high uuid;
 v_account public.cing_plaza_coin_accounts_v16%rowtype; v_old public.cing_plaza_commands_v16%rowtype;
 v_friend public.cing_plaza_friendships_v16%rowtype; v_profile public.cing_plaza_social_profiles_v16%rowtype;
 v_quantity bigint; v_cost bigint; v_receipt jsonb; v_message public.cing_plaza_messages_v16%rowtype;
 v_wallet public.cing_wallet_transactions%rowtype; v_body text; v_coin_delta bigint:=0; v_item_delta bigint:=0;
 v_actor_badge text; v_price bigint:=0; v_unit integer:=0;
begin
 if p_member_id is null or p_command_id is null or jsonb_typeof(p_payload)<>'object' then raise exception 'PLAZA_INVALID_REQUEST'; end if;
 if not coalesce((select customer_multiplayer_enabled from public.app_configs where id=1),false) then raise exception 'PLAZA_UNAVAILABLE'; end if;
 select regexp_replace(c.phone,'[^0-9]','','g'),coalesce(c.name,'Cing iu') into v_phone,v_name from public.customers c where c.id=p_member_id;
 if not found then raise exception 'PLAZA_UNAUTHORIZED'; end if;
 if left(v_phone,2)='84' then v_phone:='0'||substr(v_phone,3); end if;
 if v_phone !~ '^0[0-9]{9}$' then raise exception 'PLAZA_UNAUTHORIZED'; end if;
 if not exists(select 1 from public.players where user_id=v_phone and is_blocked=false) then raise exception 'PLAZA_MEMBER_BLOCKED'; end if;
 if not exists(select 1 from public.cing_plaza_character_profiles_v7 where member_id=p_member_id::text) then raise exception 'PLAZA_CHARACTER_REQUIRED'; end if;
 -- Lock ordering matches Wallet authorities: Wallet first, then the separate Coin account.
 if p_operation='convert' then
   insert into public.cing_wallet_accounts(user_id) values(v_phone) on conflict(user_id) do nothing;
   perform 1 from public.cing_wallet_accounts where user_id=v_phone for update;
   if (select status from public.cing_wallet_accounts where user_id=v_phone)<>'active' then raise exception 'PLAZA_WALLET_FROZEN'; end if;
 end if;
 insert into public.cing_plaza_coin_accounts_v16(member_id) values(p_member_id) on conflict do nothing;
 select * into v_account from public.cing_plaza_coin_accounts_v16 where member_id=p_member_id for update;
 select * into v_old from public.cing_plaza_commands_v16 where member_id=p_member_id and command_id=p_command_id;
 if found then
   if v_old.operation<>p_operation or v_old.payload<>p_payload then raise exception 'PLAZA_COMMAND_CONFLICT'; end if;
   return v_old.receipt;
 end if;
 select coalesce(nullif(display_name,''),nullif(zalo_name,''),v_name),selected_badge into v_name,v_actor_badge from public.players where user_id=v_phone;
 -- Badge is supplied only by the trusted backend after owned-title verification.
 v_badge:=p_payload->>'verifiedBadge';
 if p_operation in ('pm','use_loudspeaker') then
  if exists(select 1 from public.players where user_id=v_phone and chat_locked_until>now()) then raise exception 'PLAZA_CHAT_LOCKED'; end if;
  v_body:=btrim(p_payload->>'body');
  if v_body is null or char_length(v_body)<1 or char_length(v_body)>500 or regexp_replace(v_body,E'[\n\r\t]','','g') ~ '[[:cntrl:]]' then raise exception 'PLAZA_INVALID_MESSAGE'; end if;
 end if;
 if p_operation in ('friend_request','friend_accept','friend_remove','block','unblock','pm') then
  begin v_peer:=(p_payload->>'peerId')::uuid; exception when others then raise exception 'PLAZA_INVALID_MEMBER'; end;
  if v_peer is null or v_peer=p_member_id or not exists(select 1 from public.cing_plaza_character_profiles_v7 where member_id=v_peer::text) then raise exception 'PLAZA_INVALID_MEMBER'; end if;
  v_low:=least(v_peer,p_member_id);v_high:=greatest(v_peer,p_member_id);
  perform pg_advisory_xact_lock(hashtextextended(v_low::text||':'||v_high::text,0));
  if p_operation not in ('block','unblock') and exists(select 1 from public.cing_plaza_blocks_v16 where (member_id=p_member_id and blocked_id=v_peer) or (member_id=v_peer and blocked_id=p_member_id)) then raise exception 'PLAZA_MEMBER_BLOCKED'; end if;
  select * into v_friend from public.cing_plaza_friendships_v16 where low_id=v_low and high_id=v_high;
 end if;
 case p_operation
 when 'convert' then
  if coalesce(p_payload->>'quantity','') !~ '^[0-9]+$' then raise exception 'PLAZA_INVALID_QUANTITY'; end if;
  v_quantity:=(p_payload->>'quantity')::bigint;
  if v_quantity<1 or v_quantity>1000000 then raise exception 'PLAZA_INVALID_QUANTITY'; end if;
  v_price:=v_quantity*1000;v_coin_delta:=v_quantity;
  select * into v_wallet from public.cing_wallet_apply_mutation_private(v_phone,'payment',-v_price,
    'plaza-coin-v16:'||p_member_id::text||':'||p_command_id::text,'Nạp Cing Coin từ Cing Wallet',
    'cing_plaza_coin_v16',p_command_id::text,null,'customer',p_member_id::text,
    jsonb_build_object('coins',v_quantity,'vnd_per_coin',1000));
 when 'buy_loudspeaker' then
  if coalesce(p_payload->>'quantity','') !~ '^[0-9]+$' then raise exception 'PLAZA_INVALID_QUANTITY'; end if;
  v_quantity:=(p_payload->>'quantity')::bigint;
  if v_quantity<1 or v_quantity>1000 then raise exception 'PLAZA_INVALID_QUANTITY'; end if;
  v_unit:=3;v_cost:=3*v_quantity;v_coin_delta:=-v_cost;v_item_delta:=v_quantity;
  if v_account.balance<v_cost then raise exception 'PLAZA_INSUFFICIENT_COIN'; end if;
 when 'use_loudspeaker' then
  if v_account.loudspeakers<1 then raise exception 'PLAZA_LOUDSPEAKER_REQUIRED'; end if;
  if exists(select 1 from public.cing_plaza_messages_v16 where channel='world' and author_id=p_member_id and created_at>now()-interval '10 seconds') then raise exception 'PLAZA_RATE_LIMITED'; end if;
  v_item_delta:=-1;
  insert into public.cing_plaza_messages_v16(channel,author_id,author_name,author_badge,body)
   values('world',p_member_id,v_name,v_badge,v_body) returning * into v_message;
 when 'pm' then
  if not exists(select 1 from public.customers c join public.players p on p.user_id=case when left(regexp_replace(c.phone,'[^0-9]','','g'),2)='84' then '0'||substr(regexp_replace(c.phone,'[^0-9]','','g'),3) else regexp_replace(c.phone,'[^0-9]','','g') end where c.id=v_peer and p.is_blocked=false) then raise exception 'PLAZA_MEMBER_BLOCKED'; end if;
  if v_friend.status is distinct from 'accepted' then raise exception 'PLAZA_FRIEND_REQUIRED'; end if;
  if (select count(*) from public.cing_plaza_messages_v16 where author_id=p_member_id and channel='pm' and created_at>now()-interval '10 seconds')>=10 then raise exception 'PLAZA_RATE_LIMITED'; end if;
  insert into public.cing_plaza_messages_v16(channel,author_id,recipient_id,author_name,author_badge,body)
   values('pm',p_member_id,v_peer,v_name,v_badge,v_body) returning * into v_message;
 when 'friend_request' then
  if v_friend.status is null then
   if (select count(*) from public.cing_plaza_friendships_v16 where low_id=p_member_id or high_id=p_member_id)>=200 or (select count(*) from public.cing_plaza_friendships_v16 where low_id=v_peer or high_id=v_peer)>=200 then raise exception 'PLAZA_FRIEND_LIMIT'; end if;
   insert into public.cing_plaza_friendships_v16(low_id,high_id,requester_id,status) values(v_low,v_high,p_member_id,'pending');
  end if;
 when 'friend_accept' then
  if v_friend.status is null or v_friend.requester_id=p_member_id then raise exception 'PLAZA_FRIEND_REQUEST_REQUIRED'; end if;
  update public.cing_plaza_friendships_v16 set status='accepted',updated_at=now() where low_id=v_low and high_id=v_high;
 when 'friend_remove' then delete from public.cing_plaza_friendships_v16 where low_id=v_low and high_id=v_high;
 when 'block' then
  insert into public.cing_plaza_blocks_v16(member_id,blocked_id) values(p_member_id,v_peer) on conflict do nothing;
  delete from public.cing_plaza_friendships_v16 where low_id=v_low and high_id=v_high;
 when 'unblock' then delete from public.cing_plaza_blocks_v16 where member_id=p_member_id and blocked_id=v_peer;
 when 'profile' then
  insert into public.cing_plaza_social_profiles_v16(member_id) values(p_member_id) on conflict do nothing;
  select * into v_profile from public.cing_plaza_social_profiles_v16 where member_id=p_member_id for update;
  if (p_payload->>'expectedRevision')::bigint is distinct from v_profile.revision then raise exception 'PLAZA_PROFILE_STALE'; end if;
  if char_length(coalesce(p_payload->>'bio',''))>200 then raise exception 'PLAZA_INVALID_PROFILE'; end if;
  if p_payload ? 'avatarKey' and (p_payload->>'avatarKey') is not null and (p_payload->>'avatarKey') !~ ('^'||p_member_id::text||'/[0-9a-f-]{36}\.jpg$') then raise exception 'PLAZA_INVALID_AVATAR'; end if;
  update public.cing_plaza_social_profiles_v16 set bio=coalesce(p_payload->>'bio',''),
   avatar_key=case when p_payload ? 'avatarKey' then p_payload->>'avatarKey' else avatar_key end,
   revision=revision+1,updated_at=now() where member_id=p_member_id returning * into v_profile;
 else raise exception 'PLAZA_INVALID_OPERATION';
 end case;
 if p_operation in ('convert','buy_loudspeaker','use_loudspeaker') then
  update public.cing_plaza_coin_accounts_v16 set balance=balance+v_coin_delta,loudspeakers=loudspeakers+v_item_delta,updated_at=now() where member_id=p_member_id;
  insert into public.cing_plaza_coin_ledger_v16(member_id,command_id,operation,coin_delta,coin_before,coin_after,item_delta,item_before,item_after,price_vnd,unit_coin_price)
   values(p_member_id,p_command_id,p_operation,v_coin_delta,v_account.balance,v_account.balance+v_coin_delta,v_item_delta,v_account.loudspeakers,v_account.loudspeakers+v_item_delta,v_price,v_unit);
 end if;
 if p_operation in ('friend_request','friend_accept','friend_remove','block','unblock') then
  insert into public.cing_plaza_notifications_v16(member_id,event_name) values(v_peer,'friends_changed');
 end if;
 v_receipt:=jsonb_build_object('commandId',p_command_id,'operation',p_operation,'balance',v_account.balance+v_coin_delta,'loudspeakers',v_account.loudspeakers+v_item_delta,
  'message',case when v_message.id is null then null else to_jsonb(v_message) end,'revision',v_profile.revision);
 insert into public.cing_plaza_commands_v16(member_id,command_id,operation,payload,receipt) values(p_member_id,p_command_id,p_operation,p_payload,v_receipt);
 -- No PM contents, credentials or phone numbers in the audit table.
 insert into public.cing_plaza_activity_v16(event_id,member_id,event_name,details)
 values(gen_random_uuid(),p_member_id,'plaza_'||p_operation,jsonb_build_object('peerId',v_peer,'quantity',v_quantity,'coinDelta',v_coin_delta,'itemDelta',v_item_delta,'priceVnd',v_price,'messageId',v_message.id));
 return v_receipt;
end $$;
revoke all on function public.cing_plaza_social_command_v16(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cing_plaza_social_command_v16(uuid,text,uuid,jsonb) to service_role;

create function public.cing_plaza_activity_read_v16(p_search text default '',p_offset integer default 0,p_limit integer default 51)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) from (
  select a.id,a.member_id,a.event_name,a.room_id,a.room_name,a.details,a.created_at,c.name as customer_name,c.phone as customer_phone
  from public.cing_plaza_activity_v16 a left join public.customers c on c.id=a.member_id
  where coalesce(p_search,'')='' or position(lower(left(p_search,100)) in lower(coalesce(a.event_name,'')||' '||coalesce(a.room_name,'')||' '||coalesce(c.name,'')||' '||coalesce(c.phone,'')||' '||coalesce(a.member_id::text,'')))>0
  order by a.created_at desc,a.id desc offset least(greatest(p_offset,0),1000000) limit least(greatest(p_limit,1),101)
 ) rows;
$$;
revoke all on function public.cing_plaza_activity_read_v16(text,integer,integer) from public,anon,authenticated;
grant execute on function public.cing_plaza_activity_read_v16(text,integer,integer) to service_role;

commit;
