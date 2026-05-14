const express =
  require("express");

const router =
  express.Router();

const {
  spinWheel,
  getWheelRewards,
  getWheelTopPlayers,
} = require(
  "../services/wheelService"
);

const {
  spinLimiter,
} = require(
  "../middlewares/rateLimiter"
);

/**
 * =====================================================
 * TEST
 * =====================================================
 */

router.get(
  "/test",
  async (req, res) => {

    res.json({

      success: true,

      route:
        "wheel routes working",

    });

  }
);

/**
 * =====================================================
 * GET REWARDS
 * =====================================================
 */

router.get(
  "/rewards",
  async (req, res) => {

    try {

      const rewards =
        await getWheelRewards();

      res.json({

        success: true,

        rewards,

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
 * =====================================================
 * SPIN
 * =====================================================
 */

router.post(
  "/spin",

  spinLimiter,

  async (req, res) => {

    try {

      const {
        user_id,
      } = req.body;

      const result =
        await spinWheel(
          user_id
        );

      res.json({

        success: true,

        ...result,

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
 * =====================================================
 * TOP PLAYERS
 * =====================================================
 */

router.get(
  "/top",
  async (req, res) => {

    try {

      const players =
        await getWheelTopPlayers();

      res.json({

        success: true,

        players,

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