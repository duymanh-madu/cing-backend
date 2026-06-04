const supabase =
  require("../supabase");
const { emitLeaderboardUpdate } = require("./gamification/realtime/realtimeLeaderboardService");

/**
 * =====================================================
 * USE GAME PLAY
 * =====================================================
 */

async function useGamePlay(
  user_id,
  gameName = 'Bay cùng trân châu'
) {

  const {
    data: player,
    error,
  } = await supabase

    .from("players")

    .select("*")

    .eq(
      "user_id",
      user_id
    )

    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!player) {

    throw new Error(
      "Không tìm thấy player"
    );

  }

  if (
    Number(
      player.game_plays || 0
    ) <= 0
  ) {

    throw new Error(
      "Bạn đã hết lượt chơi"
    );

  }

  const newGamePlays =

    Math.max(

      Number(
        player.game_plays || 0
      ) - 1,

      0

    );

  const {
    error: updateError,
  } = await supabase

    .from("players")

    .update({

      game_plays:
        newGamePlays,

    })

    .eq(
      "user_id",
      user_id
    );

  if (updateError) {
    throw updateError;
  }

  // Log lượt chơi bị trừ
  try {
    const { deductPlays } = require('./loyaltyPointService');
    await deductPlays({ user_id, amount: 1, reason: 'Chơi ' + (gameName || 'game'), new_total: newGamePlays });
  } catch(e) {}

  return {

    game_plays:
      newGamePlays,

  };

}

/**
 * =====================================================
 * SAVE GAME SCORE
 * =====================================================
 */

async function saveGameScore({

  game_key,
  user_id,
  player_name,
  score,
  avatar = "",

}) {

  const {
    data,
    error,
  } = await supabase

    .from("game_scores")

    .insert({

      game_key,

      user_id,

      player_name,

      avatar,

      score,

    })

    .select()

    .single();

  if (error) {
    throw error;
  }

  /**
   * ANALYTICS
   */

  await supabase

    .from(
      "analytics_events"
    )

    .insert({

      event_name:
        "game_score",

      user_id,

      event_data: {

        game_key,

        score,

      },

    });

  try {
    const { data: top10 } = await supabase
      .from("game_scores")
      .select("user_id, player_name, avatar, score")
      .eq("game_key", game_key)
      .order("score", { ascending: false })
      .limit(10);
    await emitLeaderboardUpdate({ leaderboard: top10 || [] });
  } catch(e) {
    console.warn("[GAME] Leaderboard emit failed:", e.message);
  }
  return data;

}

module.exports = {

  useGamePlay,

  saveGameScore,

};