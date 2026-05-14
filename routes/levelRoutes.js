const express =
  require("express");

const router =
  express.Router();

const {

  getPlayerLevel,

  addExp,

} = require(
  "../services/levelService"
);

/**
 * =========================================
 * TEST
 * =========================================
 */

router.get(
  "/test",
  async (req, res) => {

    res.json({

      success: true,

      route:
        "level routes working",

    });

  }
);

/**
 * =========================================
 * GET LEVEL
 * =========================================
 */

router.get(
  "/player/:user_id",

  async (req, res) => {

    try {

      const data =
        await getPlayerLevel(
          req.params.user_id
        );

      res.json({

        success: true,

        data,

      });

    } catch (error) {

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * =========================================
 * ADD EXP
 * =========================================
 */

router.post(
  "/add-exp",

  async (req, res) => {

    try {

      const {

        user_id,

        exp,

      } = req.body;

      const data =
        await addExp(

          user_id,

          exp

        );

      res.json({

        success: true,

        data,

      });

    } catch (error) {

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