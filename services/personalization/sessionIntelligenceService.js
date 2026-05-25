const activeSessions =
  new Map();

/**
 * =====================================================
 * UPDATE SESSION
 * =====================================================
 */

function updateSessionIntelligence({

  session_id,

  user_id,

  engagement_score = 0,

  current_screen,

}) {

  activeSessions.set(

    session_id,

    {

      user_id,

      engagement_score,

      current_screen,

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET SESSION
 * =====================================================
 */

function getSessionIntelligence(
  session_id
) {

  return (
    activeSessions.get(
      session_id
    ) || null
  );

}

/**
 * =====================================================
 * GET ACTIVE SESSIONS
 * =====================================================
 */

function getActiveSessions() {

  return Array.from(
    activeSessions.values()
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  updateSessionIntelligence,

  getSessionIntelligence,

  getActiveSessions,

};