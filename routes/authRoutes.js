const express =
  require("express");

const router =
  express.Router();

const {
  login,
} = require(
  "../services/authService"
);

/**
 * ============================================
 * LOGIN
 * ============================================
 */

router.post(

  "/login",

  async (
    req,
    res
  ) => {

    try {

      const result =
        await login(
          req.body
        );

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