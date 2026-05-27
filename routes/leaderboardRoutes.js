const express =
  require("express");

const router =
  express.Router();

const {

  getGlobalLeaderboard,

  getTopSpenders,

  getGameLeaderboard,

  getUserRank,

} = require(
  "../services/leaderboardService"
);

/**
 * ============================================
 * TEST
 * ============================================
 */

router.get(
  "/test",
  async (req, res) => {

    res.json({

      success: true,

      route:
        "leaderboard routes working",

    });

  }
);

/**
 * ============================================
 * GLOBAL LEADERBOARD
 * ============================================
 */

router.get(
  "/global",
  async (req, res) => {

    try {

      const data =
        await getGlobalLeaderboard();

      res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * ============================================
 * TOP SPENDERS
 * ============================================
 */

router.get(
  "/top-spenders",
  async (req, res) => {

    try {

      const { period="all", from, to, limit=100 } = req.query;

        const data = await getTopSpenders({ period, from, to, limit: Number(limit) });

      res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * ============================================
 * GAME TOP
 * ============================================
 */

router.get(
  "/top-games/:gameKey",
  async (req, res) => {

    try {

      const {
        gameKey,
      } = req.params;

      const data =
        await getGameLeaderboard(
          gameKey
        );

      res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * ============================================
 * USER RANK
 * ============================================
 */

router.get(
  "/user-rank/:userId",
  async (req, res) => {

    try {

      const {
        userId,
      } = req.params;

      const period = req.query.period || "alltime";
      const data =
        await getUserRank(
          userId, { period }
        );

      res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

router.get("/user-game-rank/:userId/:gameKey", async (req, res) => {
  try {
    const { userId, gameKey } = req.params;
    const { data: scores } = await require("../supabase")
      .from("game_scores")
      .select("user_id, player_name, score")
      .eq("game_key", gameKey)
      .order("score", { ascending: false })
      .limit(2000);
    const all = scores || [];
    const idx = all.findIndex(s => String(s.user_id) === String(userId));
    if (idx === -1) {
      return res.json({ success: true, data: { rank: null, total: all.length, score: 0 } });
    }
    res.json({ success: true, data: { rank: idx + 1, total: all.length, score: all[idx].score } });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports =
  router;