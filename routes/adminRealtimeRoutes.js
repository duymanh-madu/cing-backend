const express =
  require("express");

const router =
  express.Router();

const {

  getDashboardSummary,

  getActiveOrders,

  getRecentPayments,

  getDeliveryQueue,

  getRealtimeAnalytics,

  broadcastAdminEvent,

} = require(
  "../services/adminRealtimeService"
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
        "admin realtime routes working",

    });

  }
);

/**
 * ============================================
 * DASHBOARD SUMMARY
 * ============================================
 */

router.get(
  "/dashboard",

  async (req, res) => {

    try {

      const result =

        await getDashboardSummary();

      res.json(result);

    } catch (error) {

      console.error(

        "dashboard summary error:",

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
 * ACTIVE ORDERS
 * ============================================
 */

router.get(
  "/active-orders",

  async (req, res) => {

    try {

      const {
        limit,
      } = req.query;

      const result =

        await getActiveOrders({

          limit:
            Number(limit) || 50,

        });

      res.json(result);

    } catch (error) {

      console.error(

        "active orders error:",

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
 * RECENT PAYMENTS
 * ============================================
 */

router.get(
  "/payments",

  async (req, res) => {

    try {

      const {
        limit,
      } = req.query;

      const result =

        await getRecentPayments({

          limit:
            Number(limit) || 30,

        });

      res.json(result);

    } catch (error) {

      console.error(

        "recent payments error:",

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
 * DELIVERY QUEUE
 * ============================================
 */

router.get(
  "/delivery-queue",

  async (req, res) => {

    try {

      const {
        limit,
      } = req.query;

      const result =

        await getDeliveryQueue({

          limit:
            Number(limit) || 50,

        });

      res.json(result);

    } catch (error) {

      console.error(

        "delivery queue error:",

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
 * REALTIME ANALYTICS
 * ============================================
 */

router.get(
  "/analytics",

  async (req, res) => {

    try {

      const result =

        await getRealtimeAnalytics();

      res.json(result);

    } catch (error) {

      console.error(

        "realtime analytics error:",

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
 * MANUAL BROADCAST
 * ============================================
 */

router.post(
  "/broadcast",

  async (req, res) => {

    try {

      const {

        room,

        event,

        payload,

      } = req.body;

      await broadcastAdminEvent({

        room,

        event,

        payload,

      });

      res.json({

        success: true,

      });

    } catch (error) {

      console.error(

        "manual broadcast error:",

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