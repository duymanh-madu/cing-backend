const express =
  require("express");

const router =
  express.Router();

const {

  getCurrentConfig,

  updateFeatureFlag,

  updateConfigs,

} = require(
  "../services/adminControlService"
);

/**
 * =========================================
 * GET CURRENT CONFIG
 * =========================================
 */

router.get(
  "/config",
  async (
    req,
    res
  ) => {

    try {

      const data =
        await getCurrentConfig();

      return res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.error(
        "config error:",
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
 * UPDATE FEATURE FLAG
 * =========================================
 */

router.put(
  "/feature",
  async (
    req,
    res
  ) => {

    try {

      const {

        field,

        value,

      } = req.body;

      const data =
        await updateFeatureFlag({

          field,

          value,

        });

      return res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.error(
        "feature error:",
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
 * UPDATE MULTIPLE CONFIGS
 * =========================================
 */

router.put(
  "/configs",
  async (
    req,
    res
  ) => {

    try {

      const data =
        await updateConfigs(
          req.body
        );

      return res.json({

        success: true,

        data,

      });

    } catch (error) {

      console.error(
        "configs error:",
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