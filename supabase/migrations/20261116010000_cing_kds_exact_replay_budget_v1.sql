-- CING KDS exact replay budget V1. No order/cup/control data or permission changes.
-- Complete source reads remain mandatory. Only exact persisted no-ops are pruned.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $migration$
DECLARE src text; before_md5 text; after_md5 text;
 prior_owner oid; prior_acl aclitem[]; prior_definer boolean; prior_config text[];
 target oid:=to_regprocedure('public.cing_kds_paid_ingest_p11_v1(text,jsonb)');
BEGIN
 IF target IS NULL THEN RAISE EXCEPTION 'KDS_REPLAY_FUNCTION_MISSING'; END IF;
 SELECT md5(prosrc),proowner,proacl,prosecdef,proconfig INTO before_md5,prior_owner,prior_acl,prior_definer,prior_config FROM pg_proc WHERE oid=target;
 IF before_md5='27952694ad7985000b96681ad67cf89d' THEN RETURN; END IF;
 IF before_md5<>'bc1bb90c52b73288e41c2a4477a494e1' THEN RAISE EXCEPTION 'KDS_REPLAY_BASELINE_CHANGED'; END IF;
 SELECT pg_get_functiondef(target) INTO src;
  if (length(src)-length(replace(src,$needle$cancelled_units integer:=0;$needle$,'')))/length($needle$cancelled_units integer:=0;$needle$)<>1 then raise exception 'KDS_REPLAY_PATCH_CONTEXT_CHANGED';end if;
  src:=replace(src,$needle$cancelled_units integer:=0;$needle$,$replacement$cancelled_units integer:=0;v_unchanged_orders integer:=0;$replacement$);
  if (length(src)-length(replace(src,$needle$jsonb_array_length(p_payload->'orders')>500$needle$,'')))/length($needle$jsonb_array_length(p_payload->'orders')>500$needle$)<>1 then raise exception 'KDS_REPLAY_PATCH_CONTEXT_CHANGED';end if;
  src:=replace(src,$needle$jsonb_array_length(p_payload->'orders')>500$needle$,$replacement$jsonb_array_length(p_payload->'orders')>20000$replacement$);
  if (length(src)-length(replace(src,$needle$ if exists(select 1 from jsonb_array_elements(p_payload->'orders') x group by x->>'tran_id' having count(*)>1) then raise exception 'KDS_PAID_DUPLICATE_INVOICE';end if;$needle$,'')))/length($needle$ if exists(select 1 from jsonb_array_elements(p_payload->'orders') x group by x->>'tran_id' having count(*)>1) then raise exception 'KDS_PAID_DUPLICATE_INVOICE';end if;$needle$)<>1 then raise exception 'KDS_REPLAY_PATCH_CONTEXT_CHANGED';end if;
  src:=replace(src,$needle$ if exists(select 1 from jsonb_array_elements(p_payload->'orders') x group by x->>'tran_id' having count(*)>1) then raise exception 'KDS_PAID_DUPLICATE_INVOICE';end if;$needle$,$replacement$ if exists(select 1 from jsonb_array_elements(p_payload->'orders') x group by x->>'tran_id' having count(*)>1) then raise exception 'KDS_PAID_DUPLICATE_INVOICE';end if;
 -- CING_KDS_EXACT_REPLAY_BUDGET_V1: only identical, scoped persisted payloads are inert.
 -- Keep complete source/pagination/transport bounds and validate duplicates before pruning.
 v_unchanged_orders:=jsonb_array_length(p_payload->'orders');
 p_payload:=jsonb_set(p_payload,'{orders}',coalesce((
  select jsonb_agg(incoming.value order by incoming.ordinality)
  from jsonb_array_elements(p_payload->'orders') with ordinality as incoming(value,ordinality)
  where not exists(
   select 1 from public.cing_kds_c04_orders_v1 stored
   where stored.policy_key=c.policy_key and stored.pos_parent=c.pos_parent and stored.pos_id=c.pos_id
    and stored.tran_id=incoming.value->>'tran_id'
    and stored.payload=(incoming.value-'content_hash')
    and stored.content_hash=encode(sha256(convert_to(stored.payload::text,'UTF8')),'hex')
  )
 ),'[]'::jsonb),false);
 v_unchanged_orders:=v_unchanged_orders-jsonb_array_length(p_payload->'orders');
 if jsonb_array_length(p_payload->'orders')>500 then raise exception 'KDS_PAID_LIVE_COMMIT_INVALID';end if;$replacement$);
  if (length(src)-length(replace(src,$needle$'changed_orders',changed_orders,'cancelled_units',cancelled_units);$needle$,'')))/length($needle$'changed_orders',changed_orders,'cancelled_units',cancelled_units);$needle$)<>1 then raise exception 'KDS_REPLAY_PATCH_CONTEXT_CHANGED';end if;
  src:=replace(src,$needle$'changed_orders',changed_orders,'cancelled_units',cancelled_units);$needle$,$replacement$'changed_orders',changed_orders,'cancelled_units',cancelled_units,'unchanged_orders',v_unchanged_orders);$replacement$);
 EXECUTE src;
 SELECT md5(prosrc) INTO after_md5 FROM pg_proc WHERE oid=target;
 IF after_md5<>'27952694ad7985000b96681ad67cf89d' OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=target AND
  (proowner IS DISTINCT FROM prior_owner OR proacl IS DISTINCT FROM prior_acl OR
   prosecdef IS DISTINCT FROM prior_definer OR proconfig IS DISTINCT FROM prior_config))
 THEN RAISE EXCEPTION 'KDS_REPLAY_POSTCHECK_FAILED'; END IF;
END $migration$;
SELECT jsonb_build_object('patch','CING_KDS_EXACT_REPLAY_BUDGET_V1','function_body_md5',md5(prosrc),'applied',md5(prosrc)='27952694ad7985000b96681ad67cf89d') AS kds_replay_patch
FROM pg_proc WHERE oid='public.cing_kds_paid_ingest_p11_v1(text,jsonb)'::regprocedure;
COMMIT;
