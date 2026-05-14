const express =
  require("express");

const router =
  express.Router();

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

const {

  activateMember,

} = require(
  "../services/memberActivationService"
);

/**
 * ============================================
 * ACTIVATE MEMBER
 * ============================================
 */

router.post(

  "/activate",

  authMiddleware,

  async (
    req,
    res
  ) => {

    try {

      const result =

        await activateMember({

          user_id:
            req.user.user_id,

          ...req.body,

        });

      res.json(result);

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