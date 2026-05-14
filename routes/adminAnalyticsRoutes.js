const express =
  require("express");

const router =
  express.Router();

const {

  getDashboardSummary,

} = require(
  "../services/adminAnalyticsService"
);

/**
 * =========================================
 * DASHBOARD SUMMARY
 * =========================================
 */

router.get(
  "/dashboard",
  async (
    req,
    res
  ) => {

    try {

      const data =
        await getDashboardSummary();

      return res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.error(
        "dashboard error:",
        error.message
      );

      return res.status(
        500
      ).json({

        success: false,

        message:
          error.message,

      });

    }

  }
);

/**
 * =========================================
 * EXPORT
 * =========================================
 */

module.exports =
  router;