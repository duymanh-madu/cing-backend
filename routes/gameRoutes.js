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
          user_id
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
