BEGIN;

-- =====================================================
-- CING ARTILLERY — CHARACTER IDENTITY
--
-- Principles:
--   identity belongs to the Cing Artillery domain
--   existing characters remain valid without identity
--   character names are globally unique case-insensitively
--   gender is descriptive only
--   no combat/economy/profile coupling
-- =====================================================

ALTER TABLE public.cing_artillery_characters
  ADD COLUMN IF NOT EXISTS character_name text,
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.cing_artillery_characters
  DROP CONSTRAINT IF EXISTS
    cing_artillery_characters_character_name_format_check;

ALTER TABLE public.cing_artillery_characters
  ADD CONSTRAINT
    cing_artillery_characters_character_name_format_check
  CHECK (
    character_name IS NULL
    OR (
      character_name =
        regexp_replace(
          btrim(character_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
      AND char_length(
        character_name
      ) BETWEEN 2 AND 20
    )
  );

ALTER TABLE public.cing_artillery_characters
  DROP CONSTRAINT IF EXISTS
    cing_artillery_characters_gender_check;

ALTER TABLE public.cing_artillery_characters
  ADD CONSTRAINT
    cing_artillery_characters_gender_check
  CHECK (
    gender IS NULL
    OR gender IN (
      'male',
      'female'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_characters_name_ci_uidx
ON public.cing_artillery_characters (
  lower(
    regexp_replace(
      btrim(character_name),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
)
WHERE character_name IS NOT NULL;

COMMIT;
