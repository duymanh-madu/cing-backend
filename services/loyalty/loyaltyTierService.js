const {

  MEMBER_TIERS,

} = require(
  "./loyaltyPointService"
);

/**
 * =====================================================
 * TIER CONDITIONS
 * =====================================================
 */

const TIER_RULES = [

  {

    tier:
      MEMBER_TIERS
        .HOI_VIEN,

    min_points: 0,

  },

  {

    tier:
      MEMBER_TIERS
        .HOI_VIEN_THAN_THIET,

    min_points: 500,

  },

  {

    tier:
      MEMBER_TIERS
        .HOI_VIEN_BAC,

    min_points: 2000,

  },

  {

    tier:
      MEMBER_TIERS
        .HOI_VIEN_VANG,

    min_points: 5000,

  },

  {

    tier:
      MEMBER_TIERS
        .HOI_VIEN_KIM_CUONG,

    min_points: 10000,

  },

];

/**
 * =====================================================
 * GET USER TIER
 * =====================================================
 */

function calculateMemberTier(
  points
) {

  let matched =
    TIER_RULES[0];

  for (
    const tier of
    TIER_RULES
  ) {

    if (
      points >=
      tier.min_points
    ) {

      matched = tier;

    }

  }

  return matched;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  TIER_RULES,

  calculateMemberTier,

};