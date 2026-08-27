begin;

/*
 * ==========================================================
 * CING COMMERCE — ORDER EFFECT INPUT SNAPSHOT V2
 * ==========================================================
 *
 * Durable effects whose business result depends on an input
 * resolved outside the order itself must freeze that input at
 * materialization time.
 *
 * V2 currently uses this contract for points_earn.tier_key.
 */

alter table
  public.cing_commerce_order_effects
add column if not exists
  input_payload jsonb;


/*
 * Materialize one effect together with immutable input.
 *
 * Existing row:
 *   - exact same payload => idempotent replay
 *   - different payload  => fail closed
 *
 * New row:
 *   - effect + payload are inserted atomically
 */
create or replace function
public.cing_commerce_ensure_order_effect_input_v2(
  p_order_id bigint,
  p_effect_key text,
  p_input_payload jsonb
)
returns public.cing_commerce_order_effects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect
    public.cing_commerce_order_effects%rowtype;
begin
  if p_order_id is null then
    raise exception
      'COMMERCE_EFFECT_ORDER_ID_REQUIRED'
      using errcode = '22023';
  end if;

  if p_effect_key is null
     or btrim(p_effect_key) = '' then
    raise exception
      'COMMERCE_EFFECT_KEY_REQUIRED'
      using errcode = '22023';
  end if;

  if p_input_payload is null
     or jsonb_typeof(p_input_payload) <> 'object' then
    raise exception
      'COMMERCE_EFFECT_INPUT_REQUIRED'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = p_order_id
  ) then
    raise exception
      'COMMERCE_EFFECT_ORDER_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  /*
   * points_earn V2 has one exact immutable input contract.
   */
  if p_effect_key = 'points_earn' then
    if (
         select count(*)
         from jsonb_object_keys(
           p_input_payload
         )
       ) <> 1
       or not (p_input_payload ? 'tier_key')
       or jsonb_typeof(
            p_input_payload -> 'tier_key'
          ) <> 'string'
       or nullif(
            btrim(
              p_input_payload ->> 'tier_key'
            ),
            ''
          ) is null
       or (
            p_input_payload ->> 'tier_key'
          ) not in (
            'member',
            'loyal',
            'silver',
            'gold',
            'diamond',
            'partner',
            'loyal_partner'
          ) then
      raise exception
        'COMMERCE_POINTS_EARN_INPUT_INVALID'
        using errcode = '22023';
    end if;
  else
    raise exception
      'COMMERCE_EFFECT_INPUT_KEY_UNSUPPORTED'
      using errcode = '22023';
  end if;

  insert into
    public.cing_commerce_order_effects (
      order_id,
      effect_key,
      input_payload
    )
  values (
    p_order_id,
    p_effect_key,
    p_input_payload
  )
  on conflict (
    order_id,
    effect_key
  )
  do nothing;

  select e.*
  into v_effect
  from public.cing_commerce_order_effects e
  where e.order_id = p_order_id
    and e.effect_key = p_effect_key
  for update;

  if v_effect.input_payload is null then
    raise exception
      'COMMERCE_EFFECT_INPUT_MISSING'
      using errcode = '55000';
  end if;

  if v_effect.input_payload
       is distinct from p_input_payload then
    raise exception
      'COMMERCE_EFFECT_INPUT_CONFLICT'
      using errcode = '55000';
  end if;

  return v_effect;
end;
$$;


/*
 * Read immutable input through bounded backend authority.
 */
create or replace function
public.cing_commerce_get_order_effect_input_v2(
  p_order_id bigint,
  p_effect_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_payload jsonb;
begin
  select e.input_payload
  into v_payload
  from public.cing_commerce_order_effects e
  where e.order_id = p_order_id
    and e.effect_key = p_effect_key;

  if not found then
    return null;
  end if;

  if v_payload is null then
    raise exception
      'COMMERCE_EFFECT_INPUT_MISSING'
      using errcode = '55000';
  end if;

  return v_payload;
end;
$$;


/*
 * No application role may mutate the table directly.
 * Backend receives only the two bounded V2 functions.
 */
revoke all on function
  public.cing_commerce_ensure_order_effect_input_v2(
    bigint,
    text,
    jsonb
  )
from public, anon, authenticated;

revoke all on function
  public.cing_commerce_get_order_effect_input_v2(
    bigint,
    text
  )
from public, anon, authenticated;

grant execute on function
  public.cing_commerce_ensure_order_effect_input_v2(
    bigint,
    text,
    jsonb
  )
to service_role;

grant execute on function
  public.cing_commerce_get_order_effect_input_v2(
    bigint,
    text
  )
to service_role;


/*
 * Migration invariant: no pre-existing points_earn row may
 * lack its immutable tier input.
 *
 * At this pre-cutover checkpoint production should contain
 * zero points_earn effects. Fail closed otherwise.
 */
do $migration$
begin
  if exists (
    select 1
    from public.cing_commerce_order_effects
    where effect_key = 'points_earn'
      and input_payload is null
  ) then
    raise exception
      'COMMERCE_POINTS_EARN_LEGACY_EFFECT_INPUT_MISSING';
  end if;
end;
$migration$;

commit;
