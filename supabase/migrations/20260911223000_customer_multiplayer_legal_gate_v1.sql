/*
 * CING CUSTOMER MULTIPLAYER LEGAL GATE V1
 *
 * Purpose:
 * - Temporarily disable customer-facing multiplayer games while
 *   commerce/legal filing is in progress.
 * - Does NOT disable offline gamification games.
 * - Server authority only.
 */

alter table public.app_configs
  add column if not exists customer_multiplayer_enabled boolean;

update public.app_configs
set customer_multiplayer_enabled = false
where id = 1
  and customer_multiplayer_enabled is distinct from false;

alter table public.app_configs
  alter column customer_multiplayer_enabled set default false;

alter table public.app_configs
  alter column customer_multiplayer_enabled set not null;

comment on column public.app_configs.customer_multiplayer_enabled is
  'Server-authoritative customer multiplayer availability gate. False disables Chess and Cing Piu Piu customer entry without affecting offline gamification.';


/*
 * Controlled operational switch.
 *
 * This is intentionally NOT exposed to anon/authenticated clients.
 * Only service_role may execute it.
 *
 * FALSE = temporarily close new customer multiplayer admission.
 * TRUE  = reopen existing Chess + Cing Piu Piu code paths.
 */
create or replace function public.set_customer_multiplayer_enabled(
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_configs
  set
    customer_multiplayer_enabled = p_enabled,
    updated_at = now()
  where id = 1;

  if not found then
    raise exception 'customer_multiplayer_root_config_not_found';
  end if;

  return p_enabled;
end;
$$;

revoke all
on function public.set_customer_multiplayer_enabled(boolean)
from public;

revoke all
on function public.set_customer_multiplayer_enabled(boolean)
from anon;

revoke all
on function public.set_customer_multiplayer_enabled(boolean)
from authenticated;

grant execute
on function public.set_customer_multiplayer_enabled(boolean)
to service_role;
