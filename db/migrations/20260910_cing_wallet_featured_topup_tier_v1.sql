begin;


/*
 * CING WALLET — FEATURED TOP-UP TIER V1
 *
 * Presentation metadata only.
 *
 * min_topup_amount and bonus_amount remain the complete
 * financial qualification/settlement authority.
 *
 * This migration is generated from the canonical V1 RPC
 * implementation and preserves its locking, validation,
 * atomic replacement and immutable-history behavior.
 */


alter table
  public.cing_wallet_topup_promotion_tiers
add column if not exists
  is_featured boolean
  not null
  default false;


create unique index if not exists
  cing_wallet_topup_promotion_tiers_one_featured_uq
on
  public.cing_wallet_topup_promotion_tiers (
    config_id
  )
where
  is_featured = true;


create or replace function
public.cing_wallet_admin_configure_topup_promotion_v1(
  p_enabled boolean,
  p_name text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_tiers jsonb,
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean :=
    coalesce(
      p_enabled,
      false
    );

  v_name text :=
    nullif(
      btrim(
        coalesce(
          p_name,
          ''
        )
      ),
      ''
    );

  v_actor_id text :=
    nullif(
      btrim(
        coalesce(
          p_actor_id,
          ''
        )
      ),
      ''
    );

  v_tiers jsonb :=
    coalesce(
      p_tiers,
      '[]'::jsonb
    );

  v_tier_count integer;

  v_featured_count integer;

  v_snapshot jsonb;
begin

  if jsonb_typeof(v_tiers) <> 'array' then
    raise exception
      'CING_WALLET_PROMOTION_TIERS_INVALID'
      using errcode = '22023';
  end if;


  if p_starts_at is not null
     and p_ends_at is not null
     and p_ends_at <= p_starts_at
  then
    raise exception
      'CING_WALLET_PROMOTION_TIME_WINDOW_INVALID'
      using errcode = '22023';
  end if;


  /*
   * Serialize every admin edit.
   */
  perform 1
  from
    public.cing_wallet_topup_promotion_config
  where id = 1
  for update;

  if not found then
    raise exception
      'CING_WALLET_PROMOTION_CONFIG_MISSING'
      using errcode = '55000';
  end if;


  /*
   * Validate each JSON tier before deleting the previous set.
   */
  if exists (
    select 1
    from jsonb_array_elements(
      v_tiers
    ) item
    where
      jsonb_typeof(item) <> 'object'
      or not (
        item ? 'min_topup_amount'
      )
      or not (
        item ? 'bonus_amount'
      )
      or (
        item ->> 'min_topup_amount'
      ) !~ '^[0-9]+$'
      or (
        item ->> 'bonus_amount'
      ) !~ '^[0-9]+$'
      or (
        item ->> 'min_topup_amount'
      )::numeric <= 0
      or (
        item ->> 'bonus_amount'
      )::numeric <= 0
      or (
        item ->> 'min_topup_amount'
      )::numeric >
        9223372036854775807::numeric
      or (
        item ->> 'bonus_amount'
      )::numeric >
        9223372036854775807::numeric
      or (
        item ? 'is_featured'
        and jsonb_typeof(
          item -> 'is_featured'
        ) <> 'boolean'
      )
  ) then
    raise exception
      'CING_WALLET_PROMOTION_TIER_INVALID'
      using errcode = '22023';
  end if;


  select count(*)
  into v_tier_count
  from jsonb_array_elements(
    v_tiers
  );


  if v_enabled
     and v_tier_count = 0
  then
    raise exception
      'CING_WALLET_PROMOTION_ENABLED_WITHOUT_TIERS'
      using errcode = '22023';
  end if;


  if (
    select count(*)
    from (
      select
        (
          item ->>
          'min_topup_amount'
        )::bigint
          as min_topup_amount
      from jsonb_array_elements(
        v_tiers
      ) item
      group by
        (
          item ->>
          'min_topup_amount'
        )::bigint
    ) distinct_tiers
  ) <> v_tier_count
  then
    raise exception
      'CING_WALLET_PROMOTION_TIER_DUPLICATE'
      using errcode = '22023';
  end if;


  select count(*)
  into v_featured_count
  from
    jsonb_array_elements(
      v_tiers
    ) item
  where
    coalesce(
      (
        item ->>
          'is_featured'
      )::boolean,
      false
    ) = true;


  if v_featured_count > 1 then
    raise exception
      'CING_WALLET_PROMOTION_MULTIPLE_FEATURED_TIERS'
      using errcode = '22023';
  end if;


  /*
   * Replace current tier set atomically.
   */
  delete from
    public.cing_wallet_topup_promotion_tiers
  where config_id = 1;


  insert into
  public.cing_wallet_topup_promotion_tiers (
    config_id,
    min_topup_amount,
    bonus_amount,
    is_featured
  )
  select
    1,
    (
      item ->>
      'min_topup_amount'
    )::bigint,

    (
      item ->>
      'bonus_amount'
    )::bigint,
    coalesce(
      (
        item ->>
          'is_featured'
      )::boolean,
      false
    )

  from jsonb_array_elements(
    v_tiers
  ) item;


  update
    public.cing_wallet_topup_promotion_config
  set
    enabled =
      v_enabled,

    name =
      v_name,

    starts_at =
      p_starts_at,

    ends_at =
      p_ends_at,

    updated_by =
      v_actor_id,

    updated_at =
      clock_timestamp()

  where id = 1;


  select
    jsonb_build_object(
      'enabled',
        c.enabled,

      'name',
        c.name,

      'starts_at',
        c.starts_at,

      'ends_at',
        c.ends_at,

      'updated_by',
        c.updated_by,

      'updated_at',
        c.updated_at,

      'tiers',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'min_topup_amount',
                  t.min_topup_amount,

                'bonus_amount',
                  t.bonus_amount,

                'is_featured',
                  t.is_featured
              )
              order by
                t.min_topup_amount
            )
            from
              public.cing_wallet_topup_promotion_tiers t
            where
              t.config_id = 1
          ),
          '[]'::jsonb
        )
    )
  into v_snapshot

  from
    public.cing_wallet_topup_promotion_config c

  where
    c.id = 1;


  insert into
  public.cing_wallet_topup_promotion_history (
    action,
    actor_id,
    snapshot
  )
  values (
    case
      when v_enabled
        then 'configure'
      else 'disable'
    end,

    v_actor_id,
    v_snapshot
  );


  return v_snapshot;

end;
$$;


create or replace function
public.cing_wallet_get_topup_promotion_v1()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select
    jsonb_build_object(
      'enabled',
        c.enabled,

      'name',
        c.name,

      'starts_at',
        c.starts_at,

      'ends_at',
        c.ends_at,

      'updated_at',
        c.updated_at,

      'tiers',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'min_topup_amount',
                  t.min_topup_amount,

                'bonus_amount',
                  t.bonus_amount,

                'is_featured',
                  t.is_featured
              )
              order by
                t.min_topup_amount
            )
            from
              public.cing_wallet_topup_promotion_tiers t
            where
              t.config_id = 1
          ),
          '[]'::jsonb
        )
    )
  from
    public.cing_wallet_topup_promotion_config c
  where
    c.id = 1;
$$;


/*
 * Preserve backend-only ACL.
 */

revoke all
on function
public.cing_wallet_admin_configure_topup_promotion_v1(
  boolean,
  text,
  timestamptz,
  timestamptz,
  jsonb,
  text
)
from public, anon, authenticated;

grant execute
on function
public.cing_wallet_admin_configure_topup_promotion_v1(
  boolean,
  text,
  timestamptz,
  timestamptz,
  jsonb,
  text
)
to service_role;


revoke all
on function
public.cing_wallet_get_topup_promotion_v1()
from public, anon, authenticated;

grant execute
on function
public.cing_wallet_get_topup_promotion_v1()
to service_role;


commit;
