const leaderboard =
  [];

/**
 * =====================================================
 * UPDATE LEADERBOARD
 * =====================================================
 */

function updateLeaderboard({

  user_id,

  score,

  category,

}) {

  leaderboard.push({

    user_id,

    score,

    category,

    updated_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET LEADERBOARD
 * =====================================================
 */

function getLeaderboard({

  category,

}) {

  return leaderboard

    .filter(

      (
        item
      ) =>

        item.category ===
        category

    )

    .sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    )

    .slice(0, 10);

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  updateLeaderboard,

  getLeaderboard,

};