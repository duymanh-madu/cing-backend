begin;


/*
 * ==========================================================
 * CING COMMERCE POINT REDEMPTION POLICY V1
 * ==========================================================
 *
 * Existing production semantics:
 *
 *   1 loyalty point = 1,000 VND
 *
 * This migration moves that business value out of application
 * hardcode and into the canonical app configuration authority.
 *
 * No percentage redemption cap is introduced because forensic
 * audit found no existing production policy for one.
 */


alter table public.app_configs
add column if not exists
  loyalty_point_value_vnd integer;


update public.app_configs
set loyalty_point_value_vnd = 1000
where loyalty_point_value_vnd is null;


alter table public.app_configs
alter column loyalty_point_value_vnd
set default 1000;


alter table public.app_configs
alter column loyalty_point_value_vnd
set not null;


alter table public.app_configs
drop constraint if exists
  app_configs_loyalty_point_value_vnd_ck;


alter table public.app_configs
add constraint
  app_configs_loyalty_point_value_vnd_ck
check (
  loyalty_point_value_vnd >= 1
  and loyalty_point_value_vnd <= 1000000
);


commit;
