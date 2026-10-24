-- Expose persisted open C04 identities to the collector. No source/gate/grant
-- activation and no order, cup, audit or payment changes.
begin;
do $$ declare src text;needle text;replacement text;begin
 if exists(select 1 from public.cing_kds_c03_paid_control_p11_v1 where c04_intake_enabled)
 then raise exception 'KDS_C04_PAUSE_REQUIRED';end if;
 if (select md5(prosrc) from pg_proc where oid='public.cing_kds_paid_ingest_p11_v1(text,jsonb)'::regprocedure)
 is distinct from 'db858c44cf386963181ebf805b522ab5' then raise exception 'KDS_C04_CANCEL_BASELINE_CHANGED';end if;
 select pg_get_functiondef('public.cing_kds_paid_ingest_p11_v1(text,jsonb)'::regprocedure) into src;
 needle:='''intake_mode'',''c04_order_intake_v1'',''known_transactions'',v_known';
 replacement:=needle||',''open_transactions'',coalesce((select jsonb_agg(x.tran_id order by x.tran_id) from public.cing_kds_c04_orders_v1 x where x.policy_key=c.policy_key and not x.paid_confirmed),''[]''::jsonb)';
 if (length(src)-length(replace(src,needle,'')))/length(needle)<>1 then raise exception 'KDS_C04_CANCEL_PATCH_CONTEXT_CHANGED';end if;
 execute replace(src,needle,replacement);
end $$;
revoke all on function public.cing_kds_paid_ingest_p11_v1(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_paid_ingest_p11_v1(text,jsonb) to service_role;
commit;
