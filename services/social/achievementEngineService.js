const achievements =
  [];

/**
 * =====================================================
 * UNLOCK ACHIEVEMENT
 * =====================================================
 */

function unlockAchievement({

  user_id,

  code,

  title,

}) {

  achievements.push({

    user_id,

    code,

    title,

    unlocked_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET ACHIEVEMENTS
 * =====================================================
 */

function getAchievements({

  user_id,

}) {

  return achievements.filter(

    (
      item
    ) =>

      item.user_id ===
      user_id

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  unlockAchievement,

  getAchievements,

};