const express =
  require("express");

const router =
  express.Router();

const {
  createOrder,
} = require(
  "../services/orderService"
);

const supabase =
  require("../supabase");

/**
 * ============================================
 * ORDER STATUS ENUM
 * ============================================
 */

const ORDER_STATUSES = [

  "pending",

  "confirmed",

  "preparing",

  "shipping",

  "completed",

  "cancelled",

];

/**
 * ============================================
 * TEST
 * ============================================
 */

router.get(
  "/test",

  async (req, res) => {

    return res.json({

      success: true,

      route:
        "order routes working",

    });

  }
);

/**
 * ============================================
 * CREATE ORDER
 * ============================================
 */

router.post(

  "/create",

  async (req, res) => {

    try {

      /**
       * BODY
       */

      const body =
        req.body || {};

      /**
       * VALIDATE
       */

      if (
        !body.user_id
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Missing user_id",

          });

      }

      if (
        !Array.isArray(
          body.items
        ) ||

        body.items.length === 0
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Items invalid",

          });

      }

      /**
       * CREATE
       */

      const result =

        await createOrder(
          body
        );

      return res.json(
        result
      );

    } catch (error) {

      console.error(
        error
      );

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }

);

/**
 * ============================================
 * GET USER ORDERS
 * ============================================
 */

router.get(

  "/user/:userId",

  async (req, res) => {

    try {

      const {
        userId,
      } = req.params;

      /**
       * VALIDATE
       */

      if (!userId) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Missing userId",

          });

      }

      /**
       * QUERY
       */

      const {
        data,
        error,
      } = await supabase

        .from("orders")

        .select("*")

        .eq(
          "user_id",
          userId
        )

        .order(
          "id",
          {
            ascending: false,
          }
        );

      if (error) {

        throw new Error(
          error.message
        );

      }

      return res.json({

        success: true,

        orders:
          data || [],

      });

    } catch (error) {

      console.error(
        error
      );

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }

);

/**
 * ============================================
 * UPDATE ORDER STATUS
 * ============================================
 */

router.post(

  "/update-status",

  async (req, res) => {

    try {

      const {

        order_id,

        status,

        status_text,

      } = req.body || {};

      /**
       * VALIDATE
       */

      if (
        !order_id ||
        !status
      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Missing fields",

          });

      }

      /**
       * INVALID STATUS
       */

      if (

        !ORDER_STATUSES.includes(
          status
        )

      ) {

        return res
          .status(400)
          .json({

            success: false,

            error:
              "Invalid status",

          });

      }

      /**
       * UPDATE
       */

      const {
        error,
      } = await supabase

        .from("orders")

        .update({

          status,

          status_text:

            status_text ||

            status,

          updated_at:
            new Date(),

        })

        .eq(
          "id",
          order_id
        );

      if (error) {

        throw new Error(
          error.message
        );

      }

      /**
       * EVENT LOG
       */

      await supabase

        .from(
          "analytics_events"
        )

        .insert({

          event_name:
            "order_status_updated",

          user_id: null,

          metadata: {

            order_id,

            status,

          },

        });

      return res.json({

        success: true,

      });

    } catch (error) {

      console.error(
        error
      );

      return res
        .status(500)
        .json({

          success: false,

          error:
            error.message,

        });

    }

  }

);

/**
 * ============================================
 * EXPORT
 * ============================================
 */

module.exports =
  router;
const supabase = require("../supabase");

router.get("/by-transaction/:transactionCode", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("payment_transaction_id", req.params.transactionCode)
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/latest/:userId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", req.params.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
