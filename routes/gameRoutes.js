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
      if (customer?.phone) userId = customer.phone.replace(/\D/g,"").replace(/^84/,"0");
    }

    const { data: player } = await supabase.from("players").select("game_plays, total_points").eq("user_id", userId).maybeSingle();
    res.json({ success: true, data: { game_plays: player?.game_plays ?? 0, total_points: player?.total_points ?? 0 } });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/game/daily-challenge
router.get("/daily-challenge", async (req, res) => {
  try {
    const { getTodayChallenge } = require("../services/dailyChallengeService");
    const challenge = await getTodayChallenge(req.query.game_key);
    res.json({ success: true, data: challenge });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
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
    const { data } = await supabase
      .from("game_scores")
      .select("user_id, player_name, avatar, score, game_key")
      .order("score", { ascending: false })
      .limit(100);
    
    // Group by user_id, lấy best score mỗi user mỗi game
    const byGame = {};
    (data || []).forEach(row => {
      if (!byGame[row.game_key]) byGame[row.game_key] = {};
      if (!byGame[row.game_key][row.user_id] || byGame[row.game_key][row.user_id].score < row.score) {
        byGame[row.game_key][row.user_id] = row;
      }
    });

    // Format thành array với game_key
    const GAME_CONFIG = {
      "black-pearl-rush": { display_name: "Bay cùng trân châu", icon: "🫧" },
      "chess":            { display_name: "Kỳ thủ cờ vua",      icon: "♟️" },
    };
    const VALID_GAMES = ["black-pearl-rush", "chess"];

    const result = Object.keys(byGame).filter(k => VALID_GAMES.includes(k)).map(gameKey => ({
      game_key:     gameKey,
      display_name: GAME_CONFIG[gameKey]?.display_name || gameKey,
      icon:         GAME_CONFIG[gameKey]?.icon || "🎮",
      data:         Object.values(byGame[gameKey])
        .sort((a, b) => b.score - a.score)
        .slice(0, 100)
        .map((e, i) => ({ ...e, rank: i + 1 })),
    }));

    res.json({ success: true, data: result });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
