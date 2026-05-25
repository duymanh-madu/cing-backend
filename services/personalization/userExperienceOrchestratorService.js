const userJourneys =
  new Map();

/**
 * =====================================================
 * UPDATE USER JOURNEY
 * =====================================================
 */

function updateUserJourney({

  user_id,

  state,

  metadata = {},

}) {

  userJourneys.set(

    user_id,

    {

      state,

      metadata,

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET USER JOURNEY
 * =====================================================
 */

function getUserJourney(
  user_id
) {

  return (
    userJourneys.get(
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

  updateUserJourney,

  getUserJourney,

};