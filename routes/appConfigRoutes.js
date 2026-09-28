const express =
  require("express");

const router =
  express.Router();

const {
  verifyAdmin,
} = require(
  "./adminAuthRoutes"
);

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
  verifyAdmin,
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
  verifyAdmin,
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

/*
 * CING GAME CENTER V2
 *
 * Dedicated atomic Admin Challenge
 * configuration apply endpoint.
 */

const {
  requireChallengeSuperAdmin,
} = require(
  "../services/games/revival/cingOfflineReviveChallengeAdminGate"
);

const {
  applyRevivalAdminChallenges,
} = require(
  "../services/games/revival/cingOfflineReviveAdminApplyService"
);

router.post(
  "/revival-challenges/apply",
  verifyAdmin,
  requireChallengeSuperAdmin,
  async (req, res) => {
    try {
      const data =
        await applyRevivalAdminChallenges({
          admin: req.admin,
          applyRequestId:
            req.body?.apply_request_id,
          challenges:
            req.body?.challenges,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      const status =
        [400, 403, 409].includes(
          error?.statusCode
        )
          ? error.statusCode
          : 500;

      return res.status(status).json({
        success: false,
        code:
          error?.code || "REVIVAL_ADMIN_APPLY_FAILED",
      });
    }
  }
);

module.exports =
  router;