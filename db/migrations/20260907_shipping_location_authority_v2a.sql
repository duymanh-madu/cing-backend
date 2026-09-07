begin;

alter table public.orders
  add column if not exists delivery_latitude double precision,
  add column if not exists delivery_longitude double precision,
  add column if not exists delivery_address_detail text,
  add column if not exists delivery_location_source text;

alter table public.orders
  drop constraint if exists orders_delivery_location_pair_v2a;

alter table public.orders
  add constraint orders_delivery_location_pair_v2a
  check (
    (
      delivery_latitude is null
      and delivery_longitude is null
    )
    or
    (
      delivery_latitude is not null
      and delivery_longitude is not null
      and delivery_latitude between -90 and 90
      and delivery_longitude between -180 and 180
    )
  );

alter table public.orders
  drop constraint if exists orders_delivery_location_source_v2a;

alter table public.orders
  add constraint orders_delivery_location_source_v2a
  check (
    delivery_location_source is null
    or (
      btrim(delivery_location_source) <> ''
      and length(delivery_location_source) <= 64
    )
  );

comment on column public.orders.delivery_latitude is
  'Canonical customer-confirmed delivery latitude used for shipping authority and navigation.';

comment on column public.orders.delivery_longitude is
  'Canonical customer-confirmed delivery longitude used for shipping authority and navigation.';

comment on column public.orders.delivery_address_detail is
  'Customer-entered delivery detail/instructions. Not geographic authority.';

comment on column public.orders.delivery_location_source is
  'Origin of the confirmed delivery coordinates, e.g. zalo_shell, zalo_sdk, browser_geolocation.';

commit;
