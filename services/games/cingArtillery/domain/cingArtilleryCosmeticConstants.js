const CING_ARTILLERY_ITEM_TYPE =
  Object.freeze({
    CHARACTER_SKIN:
      "character_skin",

    WEAPON_SKIN:
      "weapon_skin",

    PROJECTILE_EFFECT:
      "projectile_effect",

    EXPLOSION_EFFECT:
      "explosion_effect",

    VICTORY_EFFECT:
      "victory_effect",

    EMOTE:
      "emote",

    PET:
      "pet",

    AURA:
      "aura",

    TITLE_FRAME:
      "title_frame",

    HOME_DECOR:
      "home_decor",
  });

const CING_ARTILLERY_EQUIPPABLE_ITEM_TYPES =
  Object.freeze([
    CING_ARTILLERY_ITEM_TYPE
      .CHARACTER_SKIN,

    CING_ARTILLERY_ITEM_TYPE
      .WEAPON_SKIN,

    CING_ARTILLERY_ITEM_TYPE
      .PROJECTILE_EFFECT,

    CING_ARTILLERY_ITEM_TYPE
      .EXPLOSION_EFFECT,

    CING_ARTILLERY_ITEM_TYPE
      .VICTORY_EFFECT,

    CING_ARTILLERY_ITEM_TYPE
      .EMOTE,

    CING_ARTILLERY_ITEM_TYPE
      .PET,

    CING_ARTILLERY_ITEM_TYPE
      .AURA,

    CING_ARTILLERY_ITEM_TYPE
      .TITLE_FRAME,
  ]);

module.exports = {
  CING_ARTILLERY_ITEM_TYPE,
  CING_ARTILLERY_EQUIPPABLE_ITEM_TYPES,
};
