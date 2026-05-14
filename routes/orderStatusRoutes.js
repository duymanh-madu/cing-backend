const express =
  require("express");

const router =
  express.Router();

const supabase =
  require("../supabase");

const {

  ORDER_STATUS,

  VALID_TRANSITIONS,

  CUSTOMER_VISIBLE_STATUS,

  updateOrderStatus,

} = require(
  "../services/orderStatusService"
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
        "order status routes working",

    });

  }
);

/**
 * ============================================
 * GET STATUS CONFIG
 * ============================================
 */

router.get(
  "/config",

  async (req, res) => {

    try {

      res.json({

        success: true,

        statuses:
          ORDER_STATUS,

        valid_transitions:
          VALID_TRANSITIONS,

        customer_visible_status:

          CUSTOMER_VISIBLE_STATUS,

      });

    } catch (error) {

      console.error(

        "status config error:",

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
 * UPDATE STATUS
 * ============================================
 */

router.post(
  "/update",

  async (req, res) => {

    try {

      const {

        order_id,

        status_code,

        updated_by,

        note,

        metadata,

        send_notification,

      } = req.body;

      /**
       * VALIDATE
       */

      if (!order_id) {

        return res.status(400).json({

          success: false,

          message:
            "Missing order_id",

        });

      }

      if (!status_code) {

        return res.status(400).json({

          success: false,

          message:
            "Missing status_code",

        });

      }

      /**
       * UPDATE
       */

      const result =

        await updateOrderStatus({

          order_id,

          status_code,

          updated_by:
            updated_by ||
            "admin",

          note,

          metadata,

          send_notification:
            send_notification !== false,

        });

      /**
       * RESPONSE
       */

      res.json(result);

    } catch (error) {

      console.error(

        "update order status error:",

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
 * GET ORDER HISTORY
 * ============================================
 */

router.get(
  "/history/:orderId",

  async (req, res) => {

    try {

      const {
        orderId,
      } = req.params;

      /**
       * FIND ORDER
       */

      const {

        data: order,

        error,

      } = await supabase

        .from("orders")

        .select(

          `
          id,
          order_code,
          status_code,
          status_text,
          status_history,
          last_status_updated_at
          `
        )

        .eq(
          "id",
          orderId
        )

        .maybeSingle();

      if (error) {

        throw new Error(
          error.message
        );

      }

      if (!order) {

        return res.status(404).json({

          success: false,

          message:
            "Order not found",

        });

      }

      /**
       * RESPONSE
       */

      res.json({

        success: true,

        order,

      });

    } catch (error) {

      console.error(

        "get order history error:",

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
 * GET ORDERS BY STATUS
 * ============================================
 */

router.get(
  "/list/:statusCode",

  async (req, res) => {

    try {

      const {
        statusCode,
      } = req.params;

      const {
        limit = 20,
      } = req.query;

      /**
       * VALIDATE
       */

      if (

        !ORDER_STATUS[
          statusCode
        ]

      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid status_code",

        });

      }

      /**
       * FIND ORDERS
       */

      const {

        data: orders,

        error,

      } = await supabase

        .from("orders")

        .select("*")

        .eq(
          "status_code",
          statusCode
        )

        .order(
          "created_at",
          {
            ascending: false,
          }
        )

        .limit(
          Number(limit)
        );

      if (error) {

        throw new Error(
          error.message
        );

      }

      /**
       * RESPONSE
       */

      res.json({

        success: true,

        status_code:
          statusCode,

        total:
          orders.length,

        orders,

      });

    } catch (error) {

      console.error(

        "list orders by status error:",

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