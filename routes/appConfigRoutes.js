const express =
  require("express");

const router =
  express.Router();

const {

  getPublicAppConfig,

  updateAppConfig,

  createDefaultConfig,

} = require(
  "../services/appConfigService"
);

/**
 * =========================================
 * INIT DEFAULT CONFIG
 * =========================================
 */

router.post(
  "/init",
  async (
    req,
    res
  ) => {

    try {

      const data =
        await createDefaultConfig();

      return res.json({

        success: true,

        data,

      });

    } catch (error) {

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
 * PUBLIC CONFIG
 * =========================================
 */

router.get(
  "/public",
  async (
    req,
    res
  ) => {

    try {

      const data =
        await getPublicAppConfig();

      return res.json({

        success: true,

        data,

      });

    } catch (error) {

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
 * UPDATE CONFIG
 * =========================================
 */

router.put(
  "/:id",
  async (
    req,
    res
  ) => {

    try {

      const data =
        await updateAppConfig({

          id:
            req.params.id,

          payload:
            req.body,

        });

      return res.json({

        success: true,

        data,

      });

    } catch (error) {

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