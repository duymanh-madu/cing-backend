const express =
  require("express");

const router =
  express.Router();

  const {
  getSystemHealthSnapshot,
} = require(
  "../services/infrastructure/health/systemHealthSnapshotService"
);

/**
 * =====================================================
 * ROOT
 * =====================================================
 */

router.get(
  "/",

  (
    req,
    res
  ) => {

    return res.send(

      "🚀 Cing Hu Tang Backend Running"

    );

  }

);

/**
 * =====================================================
 * HEALTH
 * =====================================================
 */

router.get(

  "/api/health",

  (
    req,
    res
  ) => {

    return res.json({

      success: true,

      status: "OK",

      uptime:
        process.uptime(),

      timestamp:
        new Date(),

    });

  }

);

/**
 * =====================================================
 * SYSTEM HEALTH SNAPSHOT
 * =====================================================
 */

router.get(

  "/health/system",

  (

    req,

    res

  ) => {

    return res.json(

      getSystemHealthSnapshot()

    );

  }

);

module.exports =
  router;