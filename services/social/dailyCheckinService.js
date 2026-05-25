const userCheckins =
  new Map();

/**
 * =====================================================
 * DAILY CHECKIN
 * =====================================================
 */

function processDailyCheckin({

  user_id,

}) {

  const current =
    userCheckins.get(
      user_id
    ) || {

      streak: 0,

      last_checkin:
        null,

    };

  current.streak += 1;

  current.last_checkin =
    Date.now();

  userCheckins.set(
    user_id,
    current
  );

  return current;

}

/**
 * =====================================================
 * GET CHECKIN
 * =====================================================
 */

function getCheckinState(
  user_id
) {

  return (
    userCheckins.get(
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

  processDailyCheckin,

  getCheckinState,

};