BEGIN;

ALTER TABLE public.app_configs
  ADD COLUMN IF NOT EXISTS game_economy_config jsonb
  NOT NULL
  DEFAULT '{}'::jsonb;

UPDATE public.app_configs
SET game_economy_config = jsonb_build_object(
  'version', 1,
  'games', jsonb_build_object(
    'black-pearl-rush', jsonb_build_object(
      'economy_type', 'paid_offline',
      'aliases', jsonb_build_array(
        'Bay cùng trân châu'
      )
    ),
    'cing-stack-tower', jsonb_build_object(
      'economy_type', 'paid_offline',
      'aliases', jsonb_build_array(
        'Xếp Tháp Cing'
      )
    ),
    'chess', jsonb_build_object(
      'economy_type', 'free_multiplayer',
      'aliases', jsonb_build_array(
        'Kỳ thủ cờ vua',
        'chess'
      )
    )
  )
)
WHERE id = 1
  AND (
    game_economy_config IS NULL
    OR game_economy_config = '{}'::jsonb
  );

COMMIT;
