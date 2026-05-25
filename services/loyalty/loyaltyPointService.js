const loyaltyBalances =
  new Map();

/**
 * =====================================================
 * MEMBER TIERS
 * =====================================================
 */

const MEMBER_TIERS = {

  HOI_VIEN:
    "Hội viên",

  HOI_VIEN_THAN_THIET:
    "Hội viên thân thiết",

  HOI_VIEN_BAC:
    "Hội viên bạc",

  HOI_VIEN_VANG:
    "Hội viên vàng",

  HOI_VIEN_KIM_CUONG:
    "Hội viên kim cương",

};

/**
 * =====================================================
 * EARN POINTS
 * =====================================================
 */

function earnPoints({

  user_id,

  points,

}) {

  const current =
    loyaltyBalances.get(
      user_id
    ) || 0;

  const updated =
    current + points;

  loyaltyBalances.set(
    user_id,
    updated
  );

  return updated;

}

/**
 * =====================================================
 * SPEND POINTS
 * =====================================================
 */

function spendPoints({

  user_id,

  points,

}) {

  const current =
    loyaltyBalances.get(
      user_id
    ) || 0;

  if (
    current < points
  ) {

    throw new Error(
      "Không đủ điểm"
    );

  }

  const updated =
    current - points;

  loyaltyBalances.set(
    user_id,
    updated
  );

  return updated;

}

/**
 * =====================================================
 * GET BALANCE
 * =====================================================
 */

function getPointBalance(
  user_id
) {

  return (
    loyaltyBalances.get(
      user_id
    ) || 0
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  MEMBER_TIERS,

  earnPoints,

  spendPoints,

  getPointBalance,

};