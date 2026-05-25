const userSegments =
  new Map();

/**
 * =====================================================
 * SEGMENT USER
 * =====================================================
 */

function segmentUser({

  user_id,

  metrics,

}) {

  let segment =
    "new_user";

  if (
    metrics.total_orders >=
    20
  ) {

    segment =
      "vip_customer";

  } else if (
    metrics.total_games >=
    50
  ) {

    segment =
      "game_lover";

  } else if (
    metrics.inactive_days >=
    7
  ) {

    segment =
      "at_risk";

  }

  userSegments.set(

    user_id,

    {

      segment,

      metrics,

      updated_at:
        Date.now(),

    }

  );

  return segment;

}

/**
 * =====================================================
 * GET USER SEGMENT
 * =====================================================
 */

function getUserSegment(
  user_id
) {

  return (
    userSegments.get(
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

  segmentUser,

  getUserSegment,

};