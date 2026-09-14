begin;

/*
 * Cing Wallet POS reconciliation alert store projection V1.
 *
 * Read-only Super Admin authority.
 *
 * Historical store attribution preference:
 * 1. immutable payment-intent snapshot;
 * 2. live registry lookup by the session's canonical POS identity,
 *    only for legacy/no-snapshot rows.
 *
 * Partial/invalid historical snapshots never silently fall back
 * to the current registry. They project no store identity instead.
 *
 * This function owns no Wallet mutation, no reconciliation mutation,
 * and no financial decision authority.
 */

create or replace function
public.cing_wallet_list_pos_reconciliation_alerts_v2(
  p_status text default 'open',
  p_limit integer default 100,
  p_store_id uuid default null
)
returns table (
  id uuid,
  session_id uuid,
  alert_type text,
  severity text,
  status text,
  expected_amount bigint,
  actual_amount bigint,
  difference_amount bigint,
  details jsonb,
  first_detected_at timestamptz,
  last_detected_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  store_id uuid,
  store_code text,
  store_display_name text,
  pos_parent text,
  pos_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_limit integer;
begin
  v_status :=
    btrim(
      coalesce(
        p_status,
        'open'
      )
    );

  if v_status not in (
    'open',
    'resolved'
  ) then
    raise exception
      'CING_WALLET_POS_ALERT_STATUS_INVALID'
      using errcode = '22023';
  end if;

  v_limit :=
    p_limit;

  if
    v_limit is null
    or v_limit < 1
    or v_limit > 200
  then
    raise exception
      'CING_WALLET_POS_ALERT_LIMIT_INVALID'
      using errcode = '22023';
  end if;

  return query
  with projected as (
    select
      a.id,
      a.session_id,
      a.alert_type,
      a.severity,
      a.status,
      a.expected_amount,
      a.actual_amount,
      a.difference_amount,
      a.details,
      a.first_detected_at,
      a.last_detected_at,
      a.resolved_at,
      a.resolved_by,
      a.resolution_note,

      case
        when
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_id',
                ''
              )
            ),
            ''
          ) is not null
          or
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_code',
                ''
              )
            ),
            ''
          ) is not null
          or
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_display_name',
                ''
              )
            ),
            ''
          ) is not null
        then
          case
            when
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_id',
                    ''
                  )
                ),
                ''
              ) ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              and
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_code',
                    ''
                  )
                ),
                ''
              ) is not null
              and
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_display_name',
                    ''
                  )
                ),
                ''
              ) is not null
            then
              (
                pi.metadata->>'store_id'
              )::uuid
            else
              null
          end
        else
          registry.id
      end
        as projected_store_id,

      case
        when
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_id',
                ''
              )
            ),
            ''
          ) is not null
          or
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_code',
                ''
              )
            ),
            ''
          ) is not null
          or
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_display_name',
                ''
              )
            ),
            ''
          ) is not null
        then
          case
            when
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_id',
                    ''
                  )
                ),
                ''
              ) ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              and
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_code',
                    ''
                  )
                ),
                ''
              ) is not null
              and
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_display_name',
                    ''
                  )
                ),
                ''
              ) is not null
            then
              btrim(
                pi.metadata->>'store_code'
              )
            else
              null
          end
        else
          registry.store_code
      end
        as projected_store_code,

      case
        when
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_id',
                ''
              )
            ),
            ''
          ) is not null
          or
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_code',
                ''
              )
            ),
            ''
          ) is not null
          or
          nullif(
            btrim(
              coalesce(
                pi.metadata->>'store_display_name',
                ''
              )
            ),
            ''
          ) is not null
        then
          case
            when
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_id',
                    ''
                  )
                ),
                ''
              ) ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              and
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_code',
                    ''
                  )
                ),
                ''
              ) is not null
              and
              nullif(
                btrim(
                  coalesce(
                    pi.metadata->>'store_display_name',
                    ''
                  )
                ),
                ''
              ) is not null
            then
              btrim(
                pi.metadata->>'store_display_name'
              )
            else
              null
          end
        else
          registry.display_name
      end
        as projected_store_display_name,

      ps.pos_parent
        as projected_pos_parent,

      ps.pos_id
        as projected_pos_id

    from
      public.cing_wallet_pos_reconciliation_alerts a

    left join
      public.cing_wallet_pos_sessions ps
      on ps.id =
        a.session_id

    left join
      public.cing_wallet_pos_payment_intents pi
      on pi.id =
        ps.payment_intent_id

    left join
      public.cing_wallet_pos_stores registry
      on registry.pos_parent =
          ps.pos_parent
      and registry.pos_id =
          ps.pos_id

    where
      a.status =
        v_status
  )
  select
    p.id,
    p.session_id,
    p.alert_type,
    p.severity,
    p.status,
    p.expected_amount,
    p.actual_amount,
    p.difference_amount,
    p.details,
    p.first_detected_at,
    p.last_detected_at,
    p.resolved_at,
    p.resolved_by,
    p.resolution_note,
    p.projected_store_id,
    p.projected_store_code,
    p.projected_store_display_name,
    p.projected_pos_parent,
    p.projected_pos_id
  from
    projected p
  where
    p_store_id is null
    or p.projected_store_id =
      p_store_id
  order by
    p.last_detected_at desc
  limit
    v_limit;
end;
$$;

revoke all on function
public.cing_wallet_list_pos_reconciliation_alerts_v2(
  text,
  integer,
  uuid
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_list_pos_reconciliation_alerts_v2(
  text,
  integer,
  uuid
)
to service_role;


/*
 * Structural authority assertions.
 */

do $migration$
begin
  if to_regprocedure(
    'public.cing_wallet_list_pos_reconciliation_alerts_v2(text,integer,uuid)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_ALERT_STORE_PROJECTION_MISSING';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_list_pos_reconciliation_alerts_v2(text,integer,uuid)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_ALERT_STORE_PROJECTION_CLIENT_EXECUTE_FORBIDDEN';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cing_wallet_list_pos_reconciliation_alerts_v2(text,integer,uuid)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_ALERT_STORE_PROJECTION_SERVICE_ROLE_MISSING';
  end if;
end;
$migration$;

commit;
