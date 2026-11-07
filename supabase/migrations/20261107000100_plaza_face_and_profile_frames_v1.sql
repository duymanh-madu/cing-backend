-- Cing Plaza: register the existing VRM face expressions and profile frames.
-- All items stay disabled until Super Admin enables them in Catalogue V35.
begin;

alter table public.cing_plaza_appearance_items_v27
  drop constraint if exists cing_plaza_appearance_items_v27_slot_check;

alter table public.cing_plaza_appearance_items_v27
  add constraint cing_plaza_appearance_items_v27_slot_check
  check (slot in ('skin','hair','face','top','bottom','outfit','shoes','frame'));

insert into public.cing_plaza_appearance_items_v27
  (id,slot,label,price_coin,enabled,recipe,character)
values
  ('face_laugh','face','Cười rạng rỡ',0,false,'{"face":"face_laugh"}'::jsonb,null),
  ('face_confident','face','Ánh nhìn tự tin',0,false,'{"face":"face_confident"}'::jsonb,null),
  ('face_wink','face','Nháy mắt tinh nghịch',0,false,'{"face":"face_wink"}'::jsonb,null),
  ('face_teary','face','Mắt ướt phụng phịu',0,false,'{"face":"face_teary"}'::jsonb,null),
  ('face_fierce','face','Ánh nhìn quyết đoán',0,false,'{"face":"face_fierce"}'::jsonb,null),
  ('face_dreamy','face','Mơ màng buồn ngủ',0,false,'{"face":"face_dreamy"}'::jsonb,null),
  ('frame_lacquer','frame','Sơn mài Kinh Bắc',0,false,'{"frame":"frame_lacquer"}'::jsonb,null),
  ('frame_lotus','frame','Ngọc trai hoa sen',0,false,'{"frame":"frame_lotus"}'::jsonb,null),
  ('frame_pavilion','frame','Mái đình ngọc',0,false,'{"frame":"frame_pavilion"}'::jsonb,null),
  ('frame_moon','frame','Trăng hội',0,false,'{"frame":"frame_moon"}'::jsonb,null)
on conflict (id) do nothing;

commit;
