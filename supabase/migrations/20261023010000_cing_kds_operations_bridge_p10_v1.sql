-- SOURCE CANDIDATE. Applies no source mapping, payment approval or P9 activation.
-- No ingestion writer, scheduler, trigger, or grant for an individual admin.
begin;

-- Align ONLY the empty baseline observed in the Production preflight.
-- Abort if the schema/state changed; never overwrite an existing authority.
lock table public.cing_kds_orders, public.cing_kds_cups in share row exclusive mode;
do $$
begin
  if exists(select 1 from public.cing_kds_orders) or exists(select 1 from public.cing_kds_cups) then
    raise exception 'KDS_P10_EMPTY_BASELINE_REQUIRED';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='cing_kds_orders' and column_name='started_at') then
    raise exception 'KDS_P10_STARTED_AT_ALREADY_PRESENT';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='cing_kds_transition_cup_atomic_v1') then
    raise exception 'KDS_P10_TRANSITION_AUTHORITY_ALREADY_PRESENT';
  end if;
end;
$$;
alter table public.cing_kds_orders add column started_at timestamptz;

-- ============================================================
-- CING KDS PRO V1
-- ATOMIC CUP TRANSITION AUTHORITY
--
-- DORMANT: no backend EXECUTE grant.
-- DO NOT EXECUTE IN PRODUCTION WITHOUT RELEASE APPROVAL.
--
-- Depends on:
-- 20261002_cing_kds_foundation_v1.sql
-- ============================================================

CREATE FUNCTION
public.cing_kds_transition_cup_atomic_v1(
    p_cup_id uuid,
    p_actor_id text,
    p_action_key text,
    p_target_status text,
    p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_status text;
    v_version bigint;
    v_payment text;
    v_existing public.cing_kds_cup_audit%ROWTYPE;
    v_next_version bigint;
    v_occurred_at timestamptz;
    v_audit_id uuid;
BEGIN
    -- 1. Strict input validation.
    IF p_cup_id IS NULL
       OR p_actor_id IS NULL
       OR length(btrim(p_actor_id)) = 0
       OR length(p_actor_id) > 200
       OR p_action_key IS NULL
       OR length(btrim(p_action_key)) = 0
       OR length(p_action_key) > 200
       OR p_target_status IS NULL
       OR p_expected_version IS NULL
       OR p_expected_version < 0
    THEN
        RAISE EXCEPTION 'KDS_INVALID_INPUT';
    END IF;

    -- 2. Serialize mutations for this cup.
    SELECT
        c.status,
        c.version,
        o.payment_verification
    INTO
        v_status,
        v_version,
        v_payment
    FROM public.cing_kds_cups AS c
    JOIN public.cing_kds_orders AS o
      ON o.id = c.order_id
    WHERE c.id = p_cup_id
    FOR UPDATE OF c;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'KDS_CUP_NOT_FOUND';
    END IF;

    -- 3. Only verified paid orders are operable.
    IF v_payment <> 'verified' THEN
        RAISE EXCEPTION 'KDS_PAYMENT_NOT_VERIFIED';
    END IF;

    -- 4. Durable idempotency replay after acquiring lock.
    SELECT *
    INTO v_existing
    FROM public.cing_kds_cup_audit
    WHERE cup_id = p_cup_id
      AND action_key = p_action_key;

    IF FOUND THEN
        IF v_existing.actor_id <> p_actor_id
           OR v_existing.to_status <> p_target_status
           OR v_existing.previous_version <> p_expected_version
        THEN
            RAISE EXCEPTION 'KDS_IDEMPOTENCY_CONFLICT';
        END IF;

        RETURN jsonb_build_object(
            'outcome', 'replayed',
            'cup_id', p_cup_id,
            'audit_id', v_existing.id,
            'transition_version', v_existing.new_version,
            'current_version', v_version,
            'current_status', v_status
        );
    END IF;

    -- 5. Optimistic version invariant.
    IF v_version <> p_expected_version THEN
        RAISE EXCEPTION 'KDS_VERSION_CONFLICT';
    END IF;

    -- 6. Explicit legal transitions.
    IF NOT (
        (v_status = 'pending'
         AND p_target_status = 'preparing')
        OR
        (v_status = 'preparing'
         AND p_target_status = 'prepared')
        OR
        (v_status = 'prepared'
         AND p_target_status = 'served')
    ) THEN
        RAISE EXCEPTION 'KDS_INVALID_TRANSITION';
    END IF;

    -- 7. Reject version overflow.
    IF v_version = 9223372036854775807 THEN
        RAISE EXCEPTION 'KDS_VERSION_OVERFLOW';
    END IF;

    v_next_version := v_version + 1;
    v_occurred_at := clock_timestamp();

    -- 8. Update exactly one cup.
    UPDATE public.cing_kds_cups
    SET
        status = p_target_status,
        version = v_next_version,
        prepared_at = CASE
            WHEN p_target_status = 'prepared'
            THEN v_occurred_at
            ELSE prepared_at
        END,
        served_at = CASE
            WHEN p_target_status = 'served'
            THEN v_occurred_at
            ELSE served_at
        END
    WHERE id = p_cup_id
      AND version = v_version;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'KDS_CONCURRENT_UPDATE';
    END IF;

    -- 9. Audit inserted inside the same transaction.
    INSERT INTO public.cing_kds_cup_audit (
        cup_id,
        action_key,
        actor_id,
        from_status,
        to_status,
        previous_version,
        new_version,
        occurred_at
    )
    VALUES (
        p_cup_id,
        p_action_key,
        p_actor_id,
        v_status,
        p_target_status,
        v_version,
        v_next_version,
        v_occurred_at
    )
    RETURNING id INTO v_audit_id;

    -- Any failure rolls back both update and audit.
    RETURN jsonb_build_object(
        'outcome', 'applied',
        'cup_id', p_cup_id,
        'audit_id', v_audit_id,
        'transition_version', v_next_version,
        'current_version', v_next_version,
        'current_status', p_target_status,
        'occurred_at', v_occurred_at
    );
END;
$function$;

-- Function is deliberately dormant.
-- Do not expose to clients or service_role yet.

REVOKE ALL ON FUNCTION
public.cing_kds_transition_cup_atomic_v1(
    uuid, text, text, text, bigint
)
FROM PUBLIC, anon, authenticated, service_role;

-- No trigger.
-- No worker.
-- No webhook integration.
-- No production activation.


create table public.cing_kds_operations_grants_p10_v1 (
  admin_id text not null,
  pos_parent text not null check(pos_parent='BRAND-DQIR'),
  pos_id text not null check(pos_id='109664'),
  can_read boolean not null default false,
  can_transition boolean not null default false,
  can_manage_policy boolean not null default false,
  enabled boolean not null default false,
  primary key(admin_id,pos_parent,pos_id)
);
create table public.cing_kds_operations_controls_p10_v1 (
  pos_parent text not null check(pos_parent='BRAND-DQIR'),
  pos_id text not null check(pos_id='109664'),
  transitions_enabled boolean not null default false,
  primary key(pos_parent,pos_id)
);
create table public.cing_kds_operations_policy_audit_p10_v1 (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  pos_parent text not null,
  pos_id text not null,
  previous_policy jsonb,
  new_policy jsonb not null,
  changed_at timestamptz not null default clock_timestamp()
);
alter table public.cing_kds_operations_grants_p10_v1 enable row level security;
alter table public.cing_kds_operations_controls_p10_v1 enable row level security;
alter table public.cing_kds_operations_policy_audit_p10_v1 enable row level security;
revoke all on table public.cing_kds_operations_grants_p10_v1,
  public.cing_kds_operations_controls_p10_v1,
  public.cing_kds_operations_policy_audit_p10_v1 from public,anon,authenticated,service_role;

create function public.cing_kds_operations_p10_v1(
  p_admin_id text, p_operation text, p_branch jsonb, p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_role text;
  v_parent text;
  v_pos text;
  v_grant public.cing_kds_operations_grants_p10_v1%rowtype;
  v_policy public.cing_kds_sla_policies%rowtype;
  v_previous jsonb;
  v_enabled boolean;
  v_from timestamptz;
  v_to timestamptz;
  v_now timestamptz := clock_timestamp();
  v_orders jsonb;
  v_count integer;
  v_cup uuid;
  v_order uuid;
  v_action text;
  v_target text;
  v_version bigint;
  v_result jsonb;
  v_warning integer;
  v_critical integer;
begin
  select a.role into v_role from public.admins a
    where a.id::text=p_admin_id and a.active=true for share;
  if not found or v_role is null then raise exception 'KDS_OPS_FORBIDDEN'; end if;
  if p_operation is null or p_operation not in ('branches','snapshot','transition','policy')
    or jsonb_typeof(coalesce(p_payload,'{}'))<>'object' then
    raise exception 'KDS_OPS_INVALID_INPUT';
  end if;

  if p_operation='branches' then
    return jsonb_build_object('branches',coalesce((
      select jsonb_agg(jsonb_build_object(
        'pos_parent',g.pos_parent,'pos_id',g.pos_id,
        'read_enabled',coalesce(r.read_enabled,false),
        'can_transition',g.can_transition,
        'transitions_enabled',coalesce(c.transitions_enabled,false),
        'can_manage_policy',g.can_manage_policy and v_role='super_admin'
      ) order by g.pos_parent,g.pos_id)
      from public.cing_kds_operations_grants_p10_v1 g
      left join public.cing_kds_read_release_gate_p9_v1 r using(pos_parent,pos_id)
      left join public.cing_kds_operations_controls_p10_v1 c using(pos_parent,pos_id)
      where g.admin_id=p_admin_id and g.enabled and g.can_read
    ),'[]'::jsonb));
  end if;

  v_parent:=p_branch->>'pos_parent'; v_pos:=p_branch->>'pos_id';
  if v_parent is distinct from 'BRAND-DQIR' or v_pos is distinct from '109664' then
    raise exception 'KDS_OPS_FORBIDDEN';
  end if;
  select * into v_grant from public.cing_kds_operations_grants_p10_v1 g
    where g.admin_id=p_admin_id and g.pos_parent=v_parent and g.pos_id=v_pos
      and g.enabled and g.can_read for share;
  if not found then raise exception 'KDS_OPS_FORBIDDEN'; end if;

  if p_operation='policy' then
    if v_role is distinct from 'super_admin' or not v_grant.can_manage_policy then
      raise exception 'KDS_OPS_FORBIDDEN';
    end if;
    if jsonb_typeof(p_payload->'warning_minutes') is distinct from 'number'
      or jsonb_typeof(p_payload->'critical_minutes') is distinct from 'number'
      or (p_payload->>'warning_minutes') !~ '^[0-9]+$'
      or (p_payload->>'critical_minutes') !~ '^[0-9]+$' then
      raise exception 'KDS_OPS_INVALID_INPUT';
    end if;
    v_warning:=(p_payload->>'warning_minutes')::integer;
    v_critical:=(p_payload->>'critical_minutes')::integer;
    if v_warning<1 or v_critical<=v_warning or v_critical>1440 then
      raise exception 'KDS_OPS_INVALID_INPUT';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('kds-policy:'||v_parent||':'||v_pos,0));
    select to_jsonb(p) into v_previous from public.cing_kds_sla_policies p
      where p.pos_parent=v_parent and p.pos_id=v_pos::bigint for update;
    insert into public.cing_kds_sla_policies(pos_parent,pos_id,warning_minutes,critical_minutes,enabled)
      values(v_parent,v_pos::bigint,v_warning,v_critical,true)
      on conflict(pos_parent,pos_id) do update set warning_minutes=excluded.warning_minutes,
        critical_minutes=excluded.critical_minutes,enabled=true;
    insert into public.cing_kds_operations_policy_audit_p10_v1(admin_id,pos_parent,pos_id,previous_policy,new_policy)
      values(p_admin_id,v_parent,v_pos,v_previous,
        jsonb_build_object('warning_minutes',v_warning,'critical_minutes',v_critical));
    return jsonb_build_object('saved',true);
  end if;

  -- Locks serialize gate/grant revocation with each read or mutation transaction.
  select r.read_enabled into v_enabled from public.cing_kds_read_release_gate_p9_v1 r
    where r.pos_parent=v_parent and r.pos_id=v_pos for share;
  if v_enabled is distinct from true then raise exception 'KDS_OPS_READ_DISABLED'; end if;
  select * into v_policy from public.cing_kds_sla_policies p
    where p.pos_parent=v_parent and p.pos_id=v_pos::bigint and p.enabled;
  if not found then raise exception 'KDS_OPS_POLICY_REQUIRED'; end if;

  select c.transitions_enabled into v_enabled from public.cing_kds_operations_controls_p10_v1 c
    where c.pos_parent=v_parent and c.pos_id=v_pos for share;
  v_enabled:=coalesce(v_enabled,false) and v_grant.can_transition;

  if p_operation='transition' then
    if not v_enabled then raise exception 'KDS_OPS_WRITES_DISABLED'; end if;
    if jsonb_typeof(p_payload->'expected_version') is distinct from 'number'
      or (p_payload->>'expected_version') !~ '^[0-9]+$'
      or coalesce(p_payload->>'action_key','') !~ '^[A-Za-z0-9_-]{16,100}$'
      or coalesce(p_payload->>'target_status','') not in ('preparing','prepared','served') then
      raise exception 'KDS_OPS_INVALID_INPUT';
    end if;
    begin
      v_cup:=(p_payload->>'cup_id')::uuid;
      v_version:=(p_payload->>'expected_version')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'KDS_OPS_INVALID_INPUT';
    end;
    if v_cup is null or v_version is null then raise exception 'KDS_OPS_INVALID_INPUT'; end if;
    -- Follow canonical ingress lock order: inbox, order, then cup.
    select o.id into v_order from public.cing_kds_cups c
      join public.cing_kds_orders o on o.id=c.order_id
      join public.cing_kds_event_inbox i on i.pos_parent=o.pos_parent and i.pos_id=o.pos_id and i.tran_id=o.tran_id
      where c.id=v_cup and o.pos_parent=v_parent and o.pos_id=v_pos::bigint
        and o.payment_verification='verified' and i.payment_verification='verified' and i.ingestion_status='processed'
        and not exists(select 1 from public.cing_kds_inbox_conflicts f where f.inbox_id=i.id)
      for share of i;
    if not found then raise exception 'KDS_OPS_FORBIDDEN'; end if;
    perform 1 from public.cing_kds_orders o where o.id=v_order
      and o.payment_verification='verified' for share;
    if not found then raise exception 'KDS_OPS_FORBIDDEN'; end if;
    perform 1 from public.cing_kds_cups c where c.id=v_cup and c.order_id=v_order for update;
    if not found then raise exception 'KDS_OPS_FORBIDDEN'; end if;
    begin
      v_result:=public.cing_kds_transition_cup_atomic_v1(v_cup,p_admin_id,
        p_payload->>'action_key',p_payload->>'target_status',v_version);
    exception when others then
      if sqlerrm='KDS_VERSION_CONFLICT' then raise exception 'KDS_OPS_VERSION_CONFLICT';
      elsif sqlerrm='KDS_IDEMPOTENCY_CONFLICT' then raise exception 'KDS_OPS_IDEMPOTENCY_CONFLICT';
      elsif sqlerrm='KDS_INVALID_TRANSITION' then raise exception 'KDS_OPS_TRANSITION_CONFLICT';
      else raise exception 'KDS_OPS_UNAVAILABLE'; end if;
    end;
    return v_result;
  end if;

  begin
    v_from:=coalesce((p_payload->>'history_from')::timestamptz,v_now-interval '24 hours');
    v_to:=coalesce((p_payload->>'history_to')::timestamptz,v_now);
  exception when others then raise exception 'KDS_OPS_INVALID_INPUT'; end;
  if v_from>v_to or v_to>v_now+interval '1 minute' or v_to-v_from>interval '31 days' then
    raise exception 'KDS_OPS_INVALID_INPUT';
  end if;

  with eligible as (
    select o.* from public.cing_kds_orders o
    where o.pos_parent=v_parent and o.pos_id=v_pos::bigint and o.payment_verification='verified'
      and exists(select 1 from public.cing_kds_event_inbox i
        where i.pos_parent=o.pos_parent and i.pos_id=o.pos_id and i.tran_id=o.tran_id
          and i.payment_verification='verified' and i.ingestion_status='processed'
          and not exists(select 1 from public.cing_kds_inbox_conflicts f where f.inbox_id=i.id))
      and (exists(select 1 from public.cing_kds_cups c where c.order_id=o.id and c.status<>'served')
        or (select max(c.served_at) from public.cing_kds_cups c where c.order_id=o.id) between v_from and v_to)
    order by o.started_at,o.id limit 1001
  ) select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'pos_parent',o.pos_parent,'pos_id',o.pos_id::text,'tran_no',o.tran_no,
    'started_at',o.started_at,'payment_verification','verified',
    'ingestion_status','processed','conflict_status','clear',
    'cups',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'item_name',c.item_name,'item_group',c.item_group,'status',c.status,
      'version',c.version,'prepared_at',c.prepared_at,'served_at',c.served_at
    ) order by c.unit_key) from public.cing_kds_cups c where c.order_id=o.id),'[]'::jsonb)
  ) order by o.started_at,o.id),'[]'::jsonb) into v_count,v_orders from eligible o;
  if v_count>1000 or pg_column_size(v_orders)>2097152 then raise exception 'KDS_OPS_SNAPSHOT_LIMIT'; end if;
  return jsonb_build_object('branch',jsonb_build_object('pos_parent',v_parent,'pos_id',v_pos),
    'sampled_at',v_now,'orders',v_orders,
    'policy',jsonb_build_object('pos_parent',v_parent,'pos_id',v_pos,
      'warning_minutes',v_policy.warning_minutes,'critical_minutes',v_policy.critical_minutes,'enabled',true),
    'capabilities',jsonb_build_object('transitions_enabled',v_enabled),
    'history_range',jsonb_build_object('from',v_from,'to',v_to));
end;
$$;
revoke all on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cing_kds_operations_p10_v1(text,text,jsonb,jsonb) to service_role;
commit;
