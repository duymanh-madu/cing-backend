begin;

/*
 * CING BRIDGE B3 — COMMERCE / IPOS SOURCE IDENTITY
 *
 * No Revive Credit, legacy-play, Wallet, point or order mutation.
 * A successful iPOS dispatch log is required.
 *
 * This receipt proves a Commerce order was dispatched using
 * the stated external foodbook_code. It does not independently
 * prove that an arbitrary CRM event belongs to that order.
 */

create table public.cing_commerce_ipos_verified_identities_v1 (
    commerce_order_id bigint primary key
      references public.orders(id)
      on update restrict
      on delete restrict,

    foodbook_code text not null unique,

    ipos_log_reference text not null unique,

    ipos_order_id text,

    verification_method text not null
      default 'successful_ipos_dispatch_log_v1'
      check (
        verification_method =
          'successful_ipos_dispatch_log_v1'
      ),

    verified_at timestamptz not null
      default clock_timestamp(),

    constraint cing_bridge_ipos_code_nonempty_ck
      check (btrim(foodbook_code) <> ''),

    constraint cing_bridge_ipos_log_nonempty_ck
      check (btrim(ipos_log_reference) <> '')
);

revoke all
on public.cing_commerce_ipos_verified_identities_v1
from public, anon, authenticated, service_role;

grant select
on public.cing_commerce_ipos_verified_identities_v1
to service_role;

create function
public.cing_commerce_verify_ipos_source_identity_v1(
    p_order_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
    v_order public.orders%rowtype;
    v_payment public.payment_transactions%rowtype;
    v_log public.ipos_logs%rowtype;
    v_existing
      public.cing_commerce_ipos_verified_identities_v1%rowtype;

    v_code text;
    v_matches bigint;
    v_dispatches bigint;
    v_external_dispatches bigint;
begin
    if p_order_id is null then
        raise exception
          'CING_BRIDGE_ORDER_ID_REQUIRED'
          using errcode = '22023';
    end if;

    /*
     * Serialize attempts for this canonical Commerce order.
     */
    select *
      into v_order
    from public.orders
    where id = p_order_id
    for update;

    if not found then
        return jsonb_build_object(
          'status', 'review_required',
          'reason', 'commerce_order_missing'
        );
    end if;

    /*
     * Exact bidirectional Commerce payment authority.
     * Neither an iPOS log nor a matching order code
     * can substitute for a verified paid order.
     */
    select *
      into v_payment
    from public.payment_transactions
    where id = v_order.payment_transaction_id
      and order_id = v_order.id
      and order_created is true
      and payment_status = 'paid'
      and payment_purpose = 'order';

    if v_order.payment_status is distinct from 'paid'
       or not found then
        return jsonb_build_object(
          'status', 'review_required',
          'reason', 'commerce_payment_link_unverified'
        );
    end if;

    /*
     * Mirror the existing outbound iPOS payload rule:
     * remove non-alphanumeric chars, uppercase,
     * retain the last ten characters.
     *
     * This is a candidate code, NOT proof of delivery.
     */
    v_code := right(
      upper(
        regexp_replace(
          coalesce(v_order.order_code, ''),
          '[^A-Za-z0-9]',
          '',
          'g'
        )
      ),
      10
    );

    if v_code = '' then
        return jsonb_build_object(
          'status', 'review_required',
          'reason', 'ipos_foodbook_code_empty'
        );
    end if;

    /*
     * Refuse to certify a collision among currently
     * persisted Commerce orders.
     *
     * Later releases must also protect new order creation
     * against collisions before sending to iPOS.
     */
    select count(*)
      into v_matches
    from public.orders o
    where right(
      upper(
        regexp_replace(
          coalesce(o.order_code, ''),
          '[^A-Za-z0-9]',
          '',
          'g'
        )
      ),
      10
    ) = v_code;

    if v_matches <> 1 then
        return jsonb_build_object(
          'status', 'review_required',
          'reason', 'ipos_foodbook_code_collision'
        );
    end if;

    /*
     * The ten-character external identity must not have
     * been successfully dispatched for ANOTHER order.
     *
     * A successful outbound log is authoritative evidence
     * of what our backend actually sent, but a duplicate
     * external code is not a safe cross-source identity.
     *
     * This check does not infer CRM equivalence.
     */
    select count(*)
      into v_external_dispatches
    from public.ipos_logs l
    where l.sync_status = 'success'
      and l.request_payload ->> 'foodbook_code'
          = v_code
      and l.order_id is distinct from v_order.id;

    if v_external_dispatches > 0 then
        return jsonb_build_object(
          'status', 'review_required',
          'reason',
            'ipos_external_identity_claimed_by_other_order'
        );
    end if;

    /*
     * A successful durable outbound log must carry the
     * exact Commerce order_id and actual sent payload.
     *
     * Zero logs: not verified.
     * Multiple successful logs: review instead of
     * guessing which attempt established authority.
     */
    select count(*)
      into v_dispatches
    from public.ipos_logs l
    where l.order_id = v_order.id
      and l.sync_status = 'success'
      and l.request_payload ->> 'foodbook_code'
          = v_code;

    if v_dispatches <> 1 then
        return jsonb_build_object(
          'status', 'review_required',
          'reason',
            case
              when v_dispatches = 0
                then 'successful_ipos_dispatch_missing'
              else 'multiple_successful_ipos_dispatches'
            end
        );
    end if;

    select l.*
      into v_log
    from public.ipos_logs l
    where l.order_id = v_order.id
      and l.sync_status = 'success'
      and l.request_payload ->> 'foodbook_code'
          = v_code;

    /*
     * Replay must reproduce the same identity,
     * never silently rebind another log or code.
     */
    select *
      into v_existing
    from public.cing_commerce_ipos_verified_identities_v1
    where commerce_order_id = v_order.id;

    if found then
        if v_existing.foodbook_code is distinct from v_code
           or v_existing.ipos_log_reference
                is distinct from v_log.id::text then
            return jsonb_build_object(
              'status', 'review_required',
              'reason', 'identity_replay_conflict'
            );
        end if;

        return jsonb_build_object(
          'status', 'verified',
          'replayed', true,
          'commerce_order_id', v_order.id,
          'foodbook_code', v_code
        );
    end if;

    /*
     * UNIQUE(foodbook_code) prevents two different
     * Commerce orders claiming the same external identity.
     *
     * All writes are one PostgreSQL transaction.
     */
    insert into
      public.cing_commerce_ipos_verified_identities_v1 (
        commerce_order_id,
        foodbook_code,
        ipos_log_reference,
        ipos_order_id
      )
    values (
        v_order.id,
        v_code,
        v_log.id::text,
        nullif(
          btrim(coalesce(v_order.ipos_order_id::text, '')),
          ''
        )
    );

    return jsonb_build_object(
      'status', 'verified',
      'replayed', false,
      'commerce_order_id', v_order.id,
      'foodbook_code', v_code
    );
end;
$fn$;

/*
 * Dormant until full Bridge mutation + recovery testing.
 * No service_role EXECUTE in this migration.
 */
revoke all
on function
public.cing_commerce_verify_ipos_source_identity_v1(bigint)
from public, anon, authenticated, service_role;

create function
public.cing_commerce_ipos_identity_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
    raise exception
      'CING_COMMERCE_IPOS_IDENTITY_IMMUTABLE'
      using errcode = '55000';
end;
$fn$;

revoke all
on function
public.cing_commerce_ipos_identity_immutable_v1()
from public, anon, authenticated, service_role;

create trigger
  cing_commerce_ipos_identity_immutable_v1
before update or delete
on public.cing_commerce_ipos_verified_identities_v1
for each row
execute function
  public.cing_commerce_ipos_identity_immutable_v1();

commit;
