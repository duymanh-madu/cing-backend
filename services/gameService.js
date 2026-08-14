const supabase =
  require("../supabase");
const { emitLeaderboardUpdate } = require("./gamification/realtime/realtimeLeaderboardService");

/**
 * =====================================================
 * USE GAME PLAY
 * =====================================================
 */

const GAME_ECONOMY_TYPES =
  Object.freeze({
    PAID_OFFLINE:
      "paid_offline",

    FREE_MULTIPLAYER:
      "free_multiplayer",
  });

async function getGameEconomyPolicy(
  gameIdentifier
) {
  const identifier =
    String(
      gameIdentifier || ""
    ).trim();

  if (!identifier) {
    const error =
      new Error(
        "Thiếu game_key"
      );

    error.statusCode = 400;
    error.code =
      "GAME_KEY_REQUIRED";

    throw error;
  }

  const {
    data: configRow,
    error,
  } = await supabase
    .from("app_configs")
    .select("game_economy_config")
    .eq("id", 1)
    .single();

  if (error) {
    throw error;
  }

  const games =
    configRow
      ?.game_economy_config
      ?.games;

  if (
    !games ||
    typeof games !== "object"
  ) {
    const policyError =
      new Error(
        "Game economy chưa được cấu hình"
      );

    policyError.statusCode = 503;
    policyError.code =
      "GAME_ECONOMY_CONFIG_UNAVAILABLE";

    throw policyError;
  }

  let gameKey = null;
  let gamePolicy = null;

  if (
    Object.prototype.hasOwnProperty.call(
      games,
      identifier
    )
  ) {
    gameKey =
      identifier;

    gamePolicy =
      games[identifier];
  } else {
    for (
      const [
        key,
        policy,
      ] of Object.entries(games)
    ) {
      const aliases =
        Array.isArray(
          policy?.aliases
        )
          ? policy.aliases
          : [];

      const matched =
        aliases.some(
          alias =>
            String(alias || "").trim() ===
            identifier
        );

      if (matched) {
        gameKey = key;
        gamePolicy = policy;
        break;
      }
    }
  }

  if (
    !gameKey ||
    !gamePolicy
  ) {
    const error =
      new Error(
        `Game chưa có economy policy: ${identifier}`
      );

    error.statusCode = 409;
    error.code =
      "GAME_POLICY_NOT_CONFIGURED";

    throw error;
  }

  const economyType =
    String(
      gamePolicy.economy_type || ""
    ).trim();

  if (
    economyType !==
      GAME_ECONOMY_TYPES.PAID_OFFLINE &&
    economyType !==
      GAME_ECONOMY_TYPES.FREE_MULTIPLAYER
  ) {
    const error =
      new Error(
        `Economy policy không hợp lệ: ${gameKey}`
      );

    error.statusCode = 500;
    error.code =
      "INVALID_GAME_ECONOMY_POLICY";

    throw error;
  }

  return {
    game_key:
      gameKey,

    economy_type:
      economyType,

    play_cost:
      economyType ===
      GAME_ECONOMY_TYPES.PAID_OFFLINE
        ? 1
        : 0,
  };
}

/**
 * =====================================================
 * USE GAME PLAY
 * =====================================================
 */

async function useGamePlay(
  user_id,
  gameIdentifier
) {
  const policy =
    await getGameEconomyPolicy(
      gameIdentifier
    );

  const {
    data: player,
    error,
  } = await supabase
    .from("players")
    .select("game_plays")
    .eq(
      "user_id",
      user_id
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!player) {
    const error =
      new Error(
        "Không tìm thấy player"
      );

    error.statusCode = 404;
    error.code =
      "PLAYER_NOT_FOUND";

    throw error;
  }

  const currentGamePlays =
    Number(
      player.game_plays || 0
    );

  /*
   * Multiplayer realtime:
   * không tiêu lượt.
   */
  if (
    policy.play_cost === 0
  ) {
    return {
      game_key:
        policy.game_key,

      economy_type:
        policy.economy_type,

      play_cost: 0,

      play_consumed:
        false,

      game_plays:
        currentGamePlays,
    };
  }

  /*
   * Offline leaderboard game:
   * tiêu đúng 1 lượt/ván.
   */
  if (
    currentGamePlays <
    policy.play_cost
  ) {
    const error =
      new Error(
        "Bạn đã hết lượt chơi"
      );

    error.statusCode = 409;
    error.code =
      "NO_GAME_PLAYS";

    throw error;
  }

  const newGamePlays =
    currentGamePlays -
    policy.play_cost;

  /*
   * Compare-and-set để tránh
   * concurrent double-consume.
   */
  const {
    data: updatedPlayer,
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
    )
    .eq(
      "game_plays",
      currentGamePlays
    )
    .select("game_plays")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!updatedPlayer) {
    const error =
      new Error(
        "Lượt chơi vừa được sử dụng, vui lòng thử lại"
      );

    error.statusCode = 409;
    error.code =
      "GAME_PLAY_CONFLICT";

    throw error;
  }

  try {
    const {
      deductPlays,
    } =
      require(
        "./loyaltyPointService"
      );

    await deductPlays({
      user_id,
      amount:
        policy.play_cost,
      reason:
        `Chơi ${policy.game_key}`,
      new_total:
        newGamePlays,
    });
  } catch (e) {}

  return {
    game_key:
      policy.game_key,

    economy_type:
      policy.economy_type,

    play_cost:
      policy.play_cost,

    play_consumed:
      true,

    game_plays:
      Number(
        updatedPlayer.game_plays
      ),
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

  getGameEconomyPolicy,

  saveGameScore,

};