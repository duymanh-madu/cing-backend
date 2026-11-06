-- Cing Plaza Hair Atelier V1
-- Register 12 server-authoritative hair items at 50 Cing Coin by default.
-- They remain unavailable for sale until Super Admin enables them through V35.
-- Super Admin can change the catalog price or enabled state at any time.
begin;
insert into public.cing_plaza_appearance_items_v27
  (id, slot, label, price_coin, enabled, recipe, character)
values
  ('hair_cloud_bob', 'hair', 'Mây Tơ · Nữ', 50, false, '{"hair":"hair_cloud_bob"}'::jsonb, 'girl'),
  ('hair_peach_twin', 'hair', 'Song Đào · Nữ', 50, false, '{"hair":"hair_peach_twin"}'::jsonb, 'girl'),
  ('hair_lotus_chignon', 'hair', 'Sen Ngọc · Nữ', 50, false, '{"hair":"hair_lotus_chignon"}'::jsonb, 'girl'),
  ('hair_moon_waves', 'hair', 'Trăng Khuyết · Nữ', 50, false, '{"hair":"hair_moon_waves"}'::jsonb, 'girl'),
  ('hair_phoenix_ponytail', 'hair', 'Phượng Vũ · Nữ', 50, false, '{"hair":"hair_phoenix_ponytail"}'::jsonb, 'girl'),
  ('hair_silk_braid', 'hair', 'Vân Lụa · Nữ', 50, false, '{"hair":"hair_silk_braid"}'::jsonb, 'girl'),
  ('hair_scholar_part', 'hair', 'Nho Sinh · Nam', 50, false, '{"hair":"hair_scholar_part"}'::jsonb, 'boy'),
  ('hair_wind_texture', 'hair', 'Phong Vân · Nam', 50, false, '{"hair":"hair_wind_texture"}'::jsonb, 'boy'),
  ('hair_night_undercut', 'hair', 'Dạ Lam · Nam', 50, false, '{"hair":"hair_night_undercut"}'::jsonb, 'boy'),
  ('hair_young_hero', 'hair', 'Thiếu Hiệp · Nam', 50, false, '{"hair":"hair_young_hero"}'::jsonb, 'boy'),
  ('hair_chestnut_crop', 'hair', 'Hạt Dẻ · Nam', 50, false, '{"hair":"hair_chestnut_crop"}'::jsonb, 'boy'),
  ('hair_moon_curtain', 'hair', 'Lam Nguyệt · Nam', 50, false, '{"hair":"hair_moon_curtain"}'::jsonb, 'boy')
on conflict (id) do nothing;
commit;
