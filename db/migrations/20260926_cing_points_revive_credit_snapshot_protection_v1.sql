begin;

/*
 * ==========================================================
 * CING GAME CENTER V2
 * POINTS REVIVE CREDIT / CRM SNAPSHOT PROTECTION V1
 * ==========================================================
 *
 * Extends the latest established guarded snapshot authority.
 *
 * Existing Continue and Commerce fences are preserved.
 *
 * This migration does NOT:
 * - grant purchase RPC execution;
 * - debit points;
 * - grant Revive Credits;
 * - call iPOS;
 * - change existing customer balances;
 * - enable any feature flag.
 */

create index if not exists
cing_points_revive_purchase_protection_idx

on public.cing_points_revive_credit_purchases (

  user_id,

  ipos_sync_status

)

where ipos_sync_status in (

  'pending',

  'processing',

  'failed'

);


create or replace function
public.cing_loyalty_apply_external_point_snapshot_guarded(
  p_user_id text,
  p_external_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_player public.players%rowtype;
  v_protected boolean := false;
  v_balance_before integer;
begin
  if
    p_user_id is null
    or btrim(p_user_id) = ''
  then
    raise exception
      'LOYALTY_EXTERNAL_SNAPSHOT_USER_REQUIRED'
      using errcode = '22023';
  end if;

  if
    p_external_points is null
    or p_external_points < 0
  then
    raise exception
      'LOYALTY_EXTERNAL_SNAPSHOT_POINTS_INVALID'
      using errcode = '22023';
  end if;


  /*
   * Common serialization boundary for every local loyalty mutation
   * protected by this authority.
   */
  select *
  into v_player
  from public.players
  where user_id = p_user_id
  for update;


  if not found then
    insert into public.players (
      user_id,
      total_points
    )
    values (
      p_user_id,
      p_external_points
    )
    returning *
    into v_player;

    return jsonb_build_object(
      'applied', true,
      'protected', false,
      'balance_before', null,
      'total_points', p_external_points
    );
  end if;


  if
    coalesce(
      v_player.total_points,
      0
    ) <>
    trunc(
      coalesce(
        v_player.total_points,
        0
      )
    )
  then
    raise exception
      'LOYALTY_LOCAL_POINT_BALANCE_INVALID'
      using errcode = '55000';
  end if;


  v_balance_before :=
    coalesce(
      v_player.total_points,
      0
    )::integer;


  /*
   * Existing Continue durable MINUS fence.
   */
  select exists (
    select 1
    from
      public.cing_block_puzzle_continue_purchases p
    where
      p.user_id = p_user_id
      and p.ipos_sync_status in (
        'pending',
        'processing',
        'failed'
      )
  )
  into v_protected;


  /*
   * Commerce durable redemption fence.
   *
   * Point balance is mutated at RESERVE time, before payment
   * settlement and before reservation consumption.
   *
   * Therefore protection begins while the reservation is still
   * reserved/not_ready and continues after successful consume
   * until MINUS is proven in iPOS membership_log.
   *
   * Released reservations do not remain protected because release
   * restores the held points locally and requires no iPOS MINUS.
   */
  if not v_protected then

    select exists (
      select 1
      from
        public.commerce_point_reservations r
      where
        r.user_id = p_user_id
        and (
          (
            r.status = 'reserved'
            and r.ipos_sync_status = 'not_ready'
          )
          or
          (
            r.status = 'consumed'
            and r.ipos_sync_status in (
              'pending',
              'processing',
              'failed'
            )
          )
        )
    )
    into v_protected;

  end if;



  /*
   * CING GAME CENTER V2
   * Points -> Revive Credit durable MINUS fence.
   *
   * A successful PostgreSQL point debit and credit grant
   * creates a durable purchase receipt in the same transaction.
   *
   * Until the exact iPOS membership_log MINUS is proven,
   * an older CRM balance must never restore spent points.
   *
   * This extends the existing V4 + Commerce protection.
   * It does not modify their predicates or status lifecycle.
   */

  if not v_protected then

    select exists (

      select 1

      from public.cing_points_revive_credit_purchases r

      where r.user_id = p_user_id

        and r.ipos_sync_status in (

          'pending',

          'processing',

          'failed'

        )

    )

    into v_protected;

  end if;


  if v_protected then
    return jsonb_build_object(
      'applied', false,
      'protected', true,
      'balance_before', v_balance_before,
      'total_points', v_balance_before
    );
  end if;


  update public.players
  set total_points =
    p_external_points
  where user_id =
    p_user_id;


  return jsonb_build_object(
    'applied', true,
    'protected', false,
    'balance_before', v_balance_before,
    'total_points', p_external_points
  );
end;
$function$;

commit;
