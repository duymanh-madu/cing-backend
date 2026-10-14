begin;
alter table public.cing_plaza_coin_ledger_v16 drop constraint cing_plaza_coin_ledger_v16_operation_check;
alter table public.cing_plaza_coin_ledger_v16 add constraint cing_plaza_coin_ledger_v16_operation_check check(operation in ('convert','buy_loudspeaker','use_loudspeaker','buy_appearance'));
do $patch$
declare definition text; needle text; replacement text; report text;
begin
 definition:=pg_get_functiondef('public.cing_plaza_appearance_command_v27(uuid,uuid,text,text)'::regprocedure);
 needle:='insert into public.cing_plaza_appearance_owned_v27(member_id,item_id) values(p_member_id,p_item_id);';
 if strpos(definition,needle)=0 or strpos(definition,'coin_ledger_v16')>0 then raise exception 'APPEARANCE_PATCH_BASE_MISMATCH'; end if;
 replacement:=needle||$code$
 insert into public.cing_plaza_coin_ledger_v16(member_id,command_id,operation,coin_delta,coin_before,coin_after,item_delta,item_before,item_after,price_vnd,unit_coin_price)
 values(p_member_id,p_command_id,'buy_appearance',-charged,a.balance,a.balance-charged,0,a.loudspeakers,a.loudspeakers,0,charged);
 $code$;
 definition:=replace(definition,needle,replacement);
 needle:='select * into i from public.cing_plaza_appearance_items_v27';
 if strpos(definition,needle)=0 then raise exception 'APPEARANCE_PATCH_BASE_MISMATCH'; end if;
 definition:=replace(definition,needle,$code$if exists(select 1 from public.cing_plaza_commands_v16 where member_id=p_member_id and command_id=p_command_id) then raise exception 'PLAZA_COMMAND_CONFLICT'; end if;
 $code$||needle);
 needle:='return result;';
 if strpos(definition,needle)=0 then raise exception 'APPEARANCE_PATCH_BASE_MISMATCH'; end if;
 definition:=replace(definition,needle,$code$insert into public.cing_plaza_commands_v16(member_id,command_id,operation,payload,receipt) values(p_member_id,p_command_id,p_operation,jsonb_build_object('itemId',p_item_id),result);
 $code$||needle);
 execute definition;
 select pg_get_functiondef(p.oid) into report from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cing_plaza_coin_admin_report_v17' limit 1;
 needle:=$str$where operation = 'buy_loudspeaker'$str$;
 if report is null or array_length(string_to_array(report,needle),1)-1<>2 then raise exception 'COIN_REPORT_PATCH_BASE_MISMATCH'; end if;
 execute replace(report,needle,$str$where operation in ('buy_loudspeaker','buy_appearance')$str$);
end $patch$;
commit;
