const express =
  require("express");

const router =
  express.Router();

/**
 * =====================================================
 * ACTIVATION BOOTSTRAP
 * =====================================================
 * Runtime activation hydration endpoint
 * =====================================================
 */

router.post(
  "/bootstrap",

  async (
    req,
    res
  ) => {

    try {

      const {
        phone,
        zaloUserId,
      } = req.body || {};

      return res.json({

        success: true,

        customer: {

          customerId:
            zaloUserId ||
            phone ||
            "guest",

          fullName:
            "Cing Customer",

          phone:
            phone || "",

          memberTier:
            "Hội viên",

          partnerTier:
            null,

          totalSpent:
            0,

          monthlySpent:
            0,

          loyaltyPoints:
            0,

          oaFollowed:
            true,

          activated:
            true,

        },

      });

    } catch (
      error
    ) {

      return res
        .status(500)
        .json({

          success: false,

          message:
            "Activation bootstrap failed",

          error:
            error.message,

        });

    }

  }
);

module.exports =
  router;
