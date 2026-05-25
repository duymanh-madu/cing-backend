const missions =
  [];

/**
 * =====================================================
 * CREATE MISSION
 * =====================================================
 */

function createMission({

  code,

  title,

  reward_points,

  mission_type,

}) {

  missions.push({

    code,

    title,

    reward_points,

    mission_type,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET MISSIONS
 * =====================================================
 */

function getMissions() {

  return missions;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createMission,

  getMissions,

};