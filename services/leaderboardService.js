const supabase =
  require("../supabase");

/**
 * ============================================
 * GLOBAL PLAYERS
 * ============================================
 */

async function getGlobalLeaderboard() {

  const {
    data,
    error,
  } = await supabase

    .from("players")

    .select("*")

    .order(
      "total_spent_all_time",
      {
        ascending: false,
      }
    )

    .limit(100);

  if (error) {
    throw error;
  }

  return data || [];

}

/**
 * ============================================
 * TOP SPENDERS
 * ============================================
 */

async function getTopSpenders() {

  const {
    data,
    error,
  } = await supabase

    .from("players")

    .select("*")

    .order(
      "total_spent_all_time",
      {
        ascending: false,
      }
    )

    .limit(10);

  if (error) {
    throw error;
  }

  return data || [];

}

/**
 * ============================================
 * GAME LEADERBOARD
 * ============================================
 */

async function getGameLeaderboard(
  gameKey
) {

  const {
    data,
    error,
  } = await supabase

    .from("game_scores")

    .select("*")

    .eq(
      "game_key",
      gameKey
    )

    .order(
      "score",
      {
        ascending: false,
      }
    )

    .limit(50);

  if (error) {
    throw error;
  }

  return data || [];

}

/**
 * ============================================
 * USER RANK
 * ============================================
 */

async function getUserRank(
  userId
) {

  const {
    data,
    error,
  } = await supabase

    .from("players")

    .select("*")

    .order(
      "total_spent_all_time",
      {
        ascending: false,
      }
    );

  if (error) {
    throw error;
  }

  const players =
    data || [];

  const rank =
    players.findIndex(
      (item) =>
        item.user_id === userId
    ) + 1;

  const player =
    players.find(
      (item) =>
        item.user_id === userId
    );

  return {

    rank:
      rank || null,

    player:
      player || null,

    total_players:
      players.length,

  };

}

module.exports = {

  getGlobalLeaderboard,

  getTopSpenders,

  getGameLeaderboard,

  getUserRank,

};