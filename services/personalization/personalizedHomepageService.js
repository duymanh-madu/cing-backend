const personalizedHomepages =
  new Map();

/**
 * =====================================================
 * GENERATE PERSONALIZED HOMEPAGE
 * =====================================================
 */

function generatePersonalizedHomepage({

  user_id,

  member_tier,

  segments = [],

}) {

  const blocks =
    [];

  /**
   * ===================================================
   * MEMBER TIER
   * ===================================================
   */

  if (
    member_tier ===
    "Hội viên vàng"
  ) {

    blocks.push({

      type:
        "vip_voucher",

      title:
        "Ưu đãi vàng",

    });

  }

  if (
    member_tier ===
    "Hội viên kim cương"
  ) {

    blocks.push({

      type:
        "diamond_rewards",

      title:
        "Đặc quyền kim cương",

    });

  }

  /**
   * ===================================================
   * SEGMENTS
   * ===================================================
   */

  if (
    segments.includes(
      "game_lover"
    )
  ) {

    blocks.push({

      type:
        "game_block",

      title:
        "Mini game dành cho bạn",

    });

  }

  if (
    segments.includes(
      "at_risk"
    )
  ) {

    blocks.push({

      type:
        "comeback_reward",

      title:
        "Quà quay trở lại",

    });

  }

  personalizedHomepages.set(

    user_id,

    {

      blocks,

      generated_at:
        Date.now(),

    }

  );

  return blocks;

}

/**
 * =====================================================
 * GET PERSONALIZED HOMEPAGE
 * =====================================================
 */

function getPersonalizedHomepage(
  user_id
) {

  return (
    personalizedHomepages.get(
      user_id
    ) || null
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  generatePersonalizedHomepage,

  getPersonalizedHomepage,

};