const supabase =
  require("../supabase");

/**
 * =====================================================
 * USE GAME PLAY
 * =====================================================
 */

async function useGamePlay(
  user_id
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

  return data;

}

module.exports = {

  useGamePlay,

  saveGameScore,

};