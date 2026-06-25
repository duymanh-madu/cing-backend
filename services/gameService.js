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

  const numericScore =
    Number(score || 0);

  function getCurrentWeekStartVN() {
    const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const daysBack = (vnNow.getDay() + 6) % 7;
    const mondayVN = new Date(vnNow);
    mondayVN.setDate(vnNow.getDate() - daysBack);
    mondayVN.setHours(0, 0, 0, 0);
    return new Date(mondayVN.getTime() - 7 * 60 * 60 * 1000).toISOString();
  }

  const weekStartUtc =
    getCurrentWeekStartVN();

  let previousAlltimeBest = 0;
  let previousWeeklyBest = 0;

  try {
    const { data: alltimeBest } = await supabase
      .from("game_scores")
      .select("score")
      .eq("game_key", game_key)
      .eq("user_id", user_id)
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle();

    previousAlltimeBest =
      Number(alltimeBest?.score || 0);

    const { data: weeklyBest } = await supabase
      .from("game_scores")
      .select("score")
      .eq("game_key", game_key)
      .eq("user_id", user_id)
      .gte("played_at", weekStartUtc)
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle();

    previousWeeklyBest =
      Number(weeklyBest?.score || 0);
  } catch (bestErr) {
    console.warn("[GAME] Previous best check failed:", bestErr.message);
  }

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

      score:
        numericScore,

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

        score:
          numericScore,

        previous_alltime_best:
          previousAlltimeBest,

        previous_weekly_best:
          previousWeeklyBest,

      },

    });

  const weeklyHighscoreChanged =
    numericScore > previousWeeklyBest;

  const alltimeHighscoreChanged =
    numericScore > previousAlltimeBest;

  if (!weeklyHighscoreChanged && !alltimeHighscoreChanged) {
    console.log(
      `[GAME] Score saved without leaderboard emit: ${game_key} user=${user_id} score=${numericScore} weeklyBest=${previousWeeklyBest} alltimeBest=${previousAlltimeBest}`
    );

    return {
      ...data,
      highscore_changed: false,
      previous_weekly_best: previousWeeklyBest,
      previous_alltime_best: previousAlltimeBest,
    };
  }

  try {
    const { getGameLeaderboard } =
      require("./leaderboardService");

    const leaderboard =
      await getGameLeaderboard(
        game_key,
        {
          weekly: true,
          limit: 100,
        }
      );

    await emitLeaderboardUpdate({
      leaderboard,
      game_key,
      scope: "weekly",
      reason: "highscore_changed",
      updated_user: {
        user_id,
        player_name,
        avatar,
      },
      previous_best: previousWeeklyBest,
      score: numericScore,
      highscore_changed: true,
    });

    try {
      const io = global._ioInstance || global.io;
      if (io) {
        const { checkAndNotifyTop1Changes } = require("./leaderboardResetService");
        await checkAndNotifyTop1Changes(io);
      }
    } catch(e) {
      console.warn("[TOP1 GAME]", e.message);
    }
  } catch(e) {
    console.warn("[GAME] Leaderboard emit failed:", e.message);
  }

  return {
    ...data,
    highscore_changed: true,
    weekly_highscore_changed: weeklyHighscoreChanged,
    alltime_highscore_changed: alltimeHighscoreChanged,
    previous_weekly_best: previousWeeklyBest,
    previous_alltime_best: previousAlltimeBest,
  };

}

module.exports = {

  useGamePlay,

  saveGameScore,

};