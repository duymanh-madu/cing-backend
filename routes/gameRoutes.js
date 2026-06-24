const express =
  require("express");

  const {
  gameScoreLimiter,
  spinLimiter,
} = require(
  "../middlewares/rateLimiter"
);

const router =
  express.Router();

const {
  useGamePlay,
  saveGameScore,
} = require(
  "../services/gameService"
);

const { normalizePhone } =
  require("../utils/phoneIdentity");

const validateGameScore =
  require(
    "../middlewares/validateGameScore"
  );

/**
 * =====================================================
 * USE GAME PLAY
 * =====================================================
 */

router.post(
  "/use-play",
  async (req, res) => {

    try {

      const {
        user_id,
        game_name,
      } = req.body;

      if (!user_id) {

        return res.status(400).json({

          success: false,

          message:
            "Thiếu user_id",

        });

      }

      const data =
        await useGamePlay(
          user_id,
          game_name
        );

      res.json({

        success: true,

        ...data,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        message:
          error.message,

      });

    }

  }
);

/**
 * =====================================================
 * SAVE SCORE
 * =====================================================
 */

router.post(
  "/score",
  gameScoreLimiter,
  validateGameScore,
  async (req, res) => {

    try {

      const {

        game_key,
        user_id,
        score,

      } = req.body;

      if (
        !game_key ||
        !user_id ||
        score === undefined
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Thiếu dữ liệu",

        });

      }

      const data =
        await saveGameScore(
          req.body
        );

      res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        message:
          error.message,

      });

    }

  }
);

module.exports =
  router;
// GET /api/game/plays/:userId
router.get("/plays/:userId", async (req, res) => {
  try {
    const supabase = require("../supabase");
    let userId = req.params.userId;

    // Nếu là UUID thì lookup phone
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (isUUID) {
      const { data: customer } = await supabase.from("customers").select("phone").eq("id", userId).maybeSingle();
      if (customer?.phone) userId = normalizePhone(customer.phone);
    }

    const { data: player } = await supabase.from("players").select("game_plays, total_points").eq("user_id", userId).maybeSingle();
    res.json({ success: true, data: { game_plays: player?.game_plays ?? 0, total_points: player?.total_points ?? 0 } });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/game/daily-challenge — lấy tất cả challenges hôm nay
router.get("/daily-challenge", async (req, res) => {
  try {
    const supabase = require("../supabase");
    const { getTodayChallenges } = require("../services/dailyChallengeService");
    const all = await getTodayChallenges();
    res.json({ success: true, data: all });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/game/daily-challenge/reset — Admin xóa challenge hôm nay để tạo lại
router.delete("/daily-challenge/reset", async (req, res) => {
  try {
    const supabase = require("../supabase");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    await supabase.from("daily_challenges").delete().eq("challenge_date", today);
    res.json({ success: true, message: "Đã reset thách thức hôm nay. Sẽ tạo lại khi có request tiếp theo." });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/game/daily-challenge/claim
router.post("/daily-challenge/claim", async (req, res) => {
  try {
    const { user_id, player_name, avatar, combo, game_key } = req.body;
    if (!user_id || !combo) return res.status(400).json({ success: false, message: "Thiếu thông tin" });
    const { claimChallengeReward } = require("../services/dailyChallengeService");
    const result = await claimChallengeReward({ user_id, player_name, avatar, combo, game_key });
    res.json(result);
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/game/leaderboard/alltime-games
router.get("/leaderboard/alltime-games", async (req, res) => {
  try {
    const supabase = require("../supabase");

    // Đọc config từ DB — admin có thể thêm game mới qua dashboard
    const { data: cfgRow } = await supabase
      .from("app_configs")
      .select("alltime_games_config")
      .eq("id", 1)
      .single();

    const cfg = cfgRow?.alltime_games_config || {};
    const gamesConfig = cfg.games || {
      "black-pearl-rush": { enabled:true, display_name:"Bay cùng trân châu", icon:"🫧" },
    };

    // Chỉ lấy game đang enabled
    const validGames = Object.entries(gamesConfig)
      .filter(([, g]) => g.enabled !== false)
      .map(([key]) => key);

    if (validGames.length === 0) return res.json({ success:true, data:[] });

    const { data } = await supabase
      .from("game_scores")
      .select("user_id, player_name, avatar, score, game_key")
      .in("game_key", validGames)
      .order("score", { ascending: false })
      .limit(500);

    // Group by game_key + user_id, lấy best score mỗi user mỗi game
    const byGame = {};
    (data || []).forEach(row => {
      if (!byGame[row.game_key]) byGame[row.game_key] = {};
      if (!byGame[row.game_key][row.user_id] || byGame[row.game_key][row.user_id].score < row.score) {
        byGame[row.game_key][row.user_id] = row;
      }
    });

    let chessWinsData = [];
let chessStreakData = [];

if (
  validGames.includes("chess") ||
  validGames.includes("chess-wins") ||
  validGames.includes("chess-streak")
) {

  const { data: chessStats } = await supabase
    .from("chess_stats")
    .select(
      "user_id,wins,losses,draws,total_games,best_streak,current_streak"
    )
    .limit(500);

  const chessIds =
    (chessStats || []).map(
      s => s.user_id
    );

  const { data: chessPlayers } =
    chessIds.length
      ? await supabase
          .from("players")
          .select(
            "user_id,display_name,zalo_name,avatar"
          )
          .in(
            "user_id",
            chessIds
          )
      : { data: [] };

  const cpMap =
    new Map(
      (chessPlayers || [])
        .map(
          p => [p.user_id, p]
        )
    );

  chessWinsData =
    [...(chessStats || [])]
      .sort(
        (a,b) =>
          (b.wins || 0) -
          (a.wins || 0)
      )
      .map((s,i) => {

        const p =
          cpMap.get(
            s.user_id
          );

        return {
          rank: i + 1,
          user_id: s.user_id,
          player_name:
            p?.display_name ||
            p?.zalo_name ||
            "Cing iu",
          avatar:
            p?.avatar || "",
          score:
            s.wins || 0,
          wins:
            s.wins || 0,
          total_games:
            s.total_games || 0,
          winRate:
            s.total_games > 0
              ? Number(
                  (
                    s.wins /
                    s.total_games *
                    100
                  ).toFixed(1)
                )
              : 0,
        };
      });

  chessStreakData =
    [...(chessStats || [])]
      .sort(
        (a,b) =>
          (b.best_streak || 0) -
          (a.best_streak || 0)
      )
      .map((s,i) => {

        const p =
          cpMap.get(
            s.user_id
          );

        return {
          rank: i + 1,
          user_id: s.user_id,
          player_name:
            p?.display_name ||
            p?.zalo_name ||
            "Cing iu",
          avatar:
            p?.avatar || "",
          score:
            s.best_streak || 0,
          best_streak:
            s.best_streak || 0,
          current_streak:
            s.current_streak || 0,
          wins:
            s.wins || 0,
        };
      });
}

    const result = validGames.map(gameKey => {
      if (gameKey === "chess") {
  return {
    game_key: "chess",
    display_name: gamesConfig["chess"]?.display_name || "Kỳ thủ cờ vua",
    icon: gamesConfig["chess"]?.icon || "♟️",
    score_label: "Số trận thắng",
    data: chessWinsData.slice(0, 100),
  };
}

if (gameKey === "chess-wins") {
  return {
    game_key: "chess-wins",
    display_name:
      gamesConfig["chess-wins"]?.display_name ||
      "Kỳ thủ cờ vua",
    icon:
      gamesConfig["chess-wins"]?.icon ||
      "♟️",
    score_label:
      "Số trận thắng",
    data:
      chessWinsData.slice(0,100),
  };
}

if (gameKey === "chess-streak") {
  return {
    game_key: "chess-streak",
    display_name:
      gamesConfig["chess-streak"]?.display_name ||
      "Chuỗi thắng dài nhất",
    icon:
      gamesConfig["chess-streak"]?.icon ||
      "🔥",
    score_label:
      "Chuỗi thắng",
    data:
      chessStreakData.slice(0,100),
  };
}
      if (!byGame[gameKey]) return null;
      return {
        game_key:     gameKey,
        display_name: gamesConfig[gameKey]?.display_name || gameKey,
        icon:         gamesConfig[gameKey]?.icon || "🎮",
        score_label:  "Điểm cao nhất",
        data:         Object.values(byGame[gameKey])
          .sort((a, b) => b.score - a.score)
          .slice(0, 100)
          .map((e, i) => ({ ...e, rank: i + 1 })),
      };
    }).filter(Boolean);

    res.json({ success:true, data:result });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});
