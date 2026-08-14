BEGIN;

-- =====================================================
-- CING ARTILLERY — CHARACTER / INVENTORY FOUNDATION
--
-- Principles:
--   account owns game-domain state
--   inventory records ownership only
--   loadout records cosmetic expression only
--   equipped item ownership is enforced by PostgreSQL
--   equipped item type is enforced by PostgreSQL
--   no combat/ranked advantage is stored here
--   commerce is outside this phase
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cing_artillery_characters (
  account_id uuid PRIMARY KEY
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE CASCADE,

  character_key text NOT NULL
    DEFAULT 'default',

  created_at timestamptz NOT NULL
    DEFAULT now(),

  updated_at timestamptz NOT NULL
    DEFAULT now(),

  CONSTRAINT cing_artillery_characters_character_key_nonempty_check
    CHECK (
      btrim(character_key) <> ''
    )
);

CREATE TABLE IF NOT EXISTS public.cing_artillery_inventory (
  id uuid PRIMARY KEY,

  account_id uuid NOT NULL
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE CASCADE,

  item_key text NOT NULL,

  item_type text NOT NULL,

  acquired_at timestamptz NOT NULL
    DEFAULT now(),

  CONSTRAINT cing_artillery_inventory_item_key_nonempty_check
    CHECK (
      btrim(item_key) <> ''
    ),

  CONSTRAINT cing_artillery_inventory_item_type_check
    CHECK (
      item_type IN (
        'character_skin',
        'weapon_skin',
        'projectile_effect',
        'explosion_effect',
        'victory_effect',
        'emote',
        'pet',
        'aura',
        'title_frame',
        'home_decor'
      )
    ),

  CONSTRAINT cing_artillery_inventory_id_account_type_unique
    UNIQUE (
      id,
      account_id,
      item_type
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  cing_artillery_inventory_account_item_uidx
ON public.cing_artillery_inventory (
  account_id,
  item_key
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_inventory_account_type_idx
ON public.cing_artillery_inventory (
  account_id,
  item_type
);

-- =====================================================
-- LOADOUT
--
-- One equipped item per cosmetic type per account.
--
-- Composite FK guarantees:
--   1. inventory item exists
--   2. inventory item belongs to the same account
--   3. inventory item has exactly the equipped item_type
--
-- home_decor is intentionally excluded:
-- it belongs to Home Zone placement, not combat/avatar loadout.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cing_artillery_loadouts (
  account_id uuid NOT NULL
    REFERENCES public.cing_artillery_accounts(id)
    ON DELETE CASCADE,

  item_type text NOT NULL,

  inventory_item_id uuid NOT NULL,

  updated_at timestamptz NOT NULL
    DEFAULT now(),

  CONSTRAINT cing_artillery_loadouts_item_type_check
    CHECK (
      item_type IN (
        'character_skin',
        'weapon_skin',
        'projectile_effect',
        'explosion_effect',
        'victory_effect',
        'emote',
        'pet',
        'aura',
        'title_frame'
      )
    ),

  CONSTRAINT cing_artillery_loadouts_pkey
    PRIMARY KEY (
      account_id,
      item_type
    ),

  CONSTRAINT cing_artillery_loadouts_owned_typed_item_fk
    FOREIGN KEY (
      inventory_item_id,
      account_id,
      item_type
    )
    REFERENCES public.cing_artillery_inventory (
      id,
      account_id,
      item_type
    )
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS
  cing_artillery_loadouts_inventory_item_idx
ON public.cing_artillery_loadouts (
  inventory_item_id
);

COMMIT;
