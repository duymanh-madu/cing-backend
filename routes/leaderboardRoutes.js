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

      const data =
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

      const data =
        await getUserRank(
          userId
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

module.exports =
  router;