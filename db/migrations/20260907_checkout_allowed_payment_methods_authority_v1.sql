/*
 * CING CHECKOUT — ALLOWED PAYMENT METHODS AUTHORITY V1
 *
 * Root cause:
 * checkoutValidationService consumes
 * app_configs.allowed_payment_methods, but production did not
 * have that schema field.
 *
 * app_configs remains the runtime payment-method authority.
 *
 * This migration:
 * - provisions the missing config column,
 * - preserves the historical bank_transfer + momo baseline,
 * - explicitly enables Cing Wallet,
 * - rejects malformed or duplicate method identifiers,
 * - does not mutate payment/order/Wallet/loyalty financial state.
 */


/*
 * PostgreSQL CHECK constraints cannot contain subqueries
 * directly.
 *
 * Keep array validation in one deterministic immutable helper;
 * the table CHECK itself invokes only this bounded predicate.
 */
create or replace function
public.cing_checkout_payment_methods_valid_v1(
  p_methods text[]
)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  select
    cardinality(p_methods) > 0
    and not exists (
      select 1
      from unnest(p_methods) as method(value)
      where method.value is null
         or btrim(method.value) = ''
         or method.value <>
              lower(btrim(method.value))
    )
    and cardinality(p_methods) =
      (
        select count(distinct method.value)
        from unnest(p_methods) as method(value)
      );
$$;


/*
 * Financial/config authority is backend-only.
 */
revoke all on function
public.cing_checkout_payment_methods_valid_v1(text[])
from public;

revoke all on function
public.cing_checkout_payment_methods_valid_v1(text[])
from anon;

revoke all on function
public.cing_checkout_payment_methods_valid_v1(text[])
from authenticated;

grant execute on function
public.cing_checkout_payment_methods_valid_v1(text[])
to service_role;


/*
 * Provision the missing configuration field.
 */
alter table public.app_configs
add column if not exists
  allowed_payment_methods text[];


/*
 * Before this authority, checkout's effective fallback was:
 *   bank_transfer
 *   momo
 *
 * Cing Wallet is now a supported internal production tender.
 */
update public.app_configs
set allowed_payment_methods =
  array[
    'bank_transfer',
    'momo',
    'cing_wallet'
  ]::text[]
where allowed_payment_methods is null;


/*
 * New configuration rows inherit the same deterministic baseline.
 */
alter table public.app_configs
alter column allowed_payment_methods
set default
  array[
    'bank_transfer',
    'momo',
    'cing_wallet'
  ]::text[];

alter table public.app_configs
alter column allowed_payment_methods
set not null;


/*
 * Keep method configuration normalized, non-empty and unique.
 */
alter table public.app_configs
drop constraint if exists
  app_configs_allowed_payment_methods_valid_ck;

alter table public.app_configs
add constraint
  app_configs_allowed_payment_methods_valid_ck
check (
  public.cing_checkout_payment_methods_valid_v1(
    allowed_payment_methods
  )
);
