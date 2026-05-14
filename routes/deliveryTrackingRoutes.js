const express =
  require("express");

const router =
  express.Router();

const {

  createDeliveryTracking,

  updateDeliveryStatus,

  getTracking,

  DELIVERY_STATUS,

} = require(
  "../services/deliveryTrackingService"
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
        "delivery tracking routes working",

    });

  }
);

/**
 * ============================================
 * DELIVERY STATUS CONFIG
 * ============================================
 */

router.get(
  "/config",

  async (req, res) => {

    res.json({

      success: true,

      delivery_status:
        DELIVERY_STATUS,

    });

  }
);

/**
 * ============================================
 * CREATE TRACKING
 * ============================================
 */

router.post(
  "/create",

  requirePermission(
    "delivery.update"
  ),

  async (req, res) => {

    try {

      const result =

        await createDeliveryTracking(
          req.body
        );

      res.json(result);

    } catch (error) {

      console.error(

        "create delivery tracking error:",

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
 * UPDATE DELIVERY STATUS
 * ============================================
 */

router.post(
  "/update-status",

  requirePermission(
    "delivery.update"
  ),

  async (req, res) => {

    try {

      const result =

        await updateDeliveryStatus(
          req.body
        );

      res.json(result);

    } catch (error) {

      console.error(

        "update delivery status error:",

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
 * GET TRACKING
 * ============================================
 */

router.get(
  "/tracking",

  async (req, res) => {

    try {

      const {

        tracking_id,

        order_id,

      } = req.query;

      const result =
        await getTracking({

          tracking_id,

          order_id,

        });

      res.json(result);

    } catch (error) {

      console.error(

        "get tracking error:",

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