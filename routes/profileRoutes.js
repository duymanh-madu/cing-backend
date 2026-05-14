const express =
  require("express");

const router =
  express.Router();

const {
  createOrUpdateMember,
} = require(
  "../services/profileService"
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
        "profile routes working",

    });

  }
);

/**
 * ============================================
 * AUTO MEMBER ACTIVATION
 * ============================================
 */

router.post(
  "/activate-member",

  async (req, res) => {

    try {

      const {

        zalo_user_id,

        zalo_name,

        zalo_avatar,

        phone_number,

        oa_followed,

        metadata,

      } = req.body;

      const result =

        await createOrUpdateMember({

          zalo_user_id,

          zalo_name,

          zalo_avatar,

          phone_number,

          oa_followed,

          metadata,

        });

      res.json(result);

    } catch (error) {

      console.error(
        "activate member error:",
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