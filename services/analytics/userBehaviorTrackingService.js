const behaviorEvents =

  [];

/**

 * =====================================================

 * TRACK USER BEHAVIOR

 * =====================================================

 */

function trackUserBehavior({

  user_id,

  session_id,

  event,

  metadata,

}) {

  behaviorEvents.push({

    user_id,

    session_id,

    event,

    metadata:

      metadata || {},

    created_at:

      Date.now(),

  });

}

/**

 * =====================================================

 * GET USER BEHAVIORS

 * =====================================================

 */

function getUserBehaviorEvents() {

  return behaviorEvents;

}

/**

 * =====================================================

 * EXPORTS

 * =====================================================

 */

module.exports = {

  trackUserBehavior,

  getUserBehaviorEvents,

};