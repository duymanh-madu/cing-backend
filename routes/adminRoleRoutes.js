const express =
  require("express");

const router =
  express.Router();

const {

  createAdminRole,

  ROLE_CONFIG,

} = require(
  "../services/adminRoleService"
);

const {

  requirePermission,

} = require(
  "../middlewares/adminAuthMiddleware"
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
        "admin role routes working",

    });

  }
);

/**
 * ============================================
 * GET ROLE CONFIG
 * ============================================
 */

router.get(
  "/config",

  async (req, res) => {

    res.json({

      success: true,

      roles:
        ROLE_CONFIG,

    });

  }
);

/**
 * ============================================
 * CREATE ADMIN
 * ============================================
 */

router.post(
  "/create",

  requirePermission(
    "campaigns.manage"
  ),

  async (req, res) => {

    try {

      const result =
        await createAdminRole(
          req.body
        );

      res.json(result);

    } catch (error) {

      console.error(

        "create admin role error:",

        error.message

      );

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
 * EXPORTS
 * ============================================
 */

module.exports =
  router;