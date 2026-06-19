const express =
  require("express");

function normalizeOrderType(value, shippingAddress = "") {
  const raw = String(value || "").trim().toLowerCase();

  if (["delivery", "deli", "ship", "shipping"].includes(raw)) return "delivery";
  if (["dine_in", "dinein", "store", "table", "eat_in"].includes(raw)) return "dine_in";
  if (["pickup", "takeaway", "take_away", "takeout", "mang_ve"].includes(raw)) return "pickup";

  return String(shippingAddress || "").trim() ? "delivery" : "pickup";
}

const router =
  express.Router();

const {

  validateCheckout,

} = require(
  "../services/checkoutValidationService"
);

const {

  createPaymentSession,

} = require(
  "../services/paymentService"
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
        "checkout routes working",

    });

  }
);

/**
 * ============================================
 * VALIDATE CHECKOUT
 * ============================================
 */

router.post(

  "/validate",

  async (req, res) => {

    try {

      const {

        items,

        destination_latitude,

        destination_longitude,

        submitted_shipping_fee,

        submitted_total_amount,

        payment_method,

      } = req.body;

      /**
       * VALIDATE
       */

      const result =

        await validateCheckout({

          items,

          destination_latitude,

          destination_longitude,

          submitted_shipping_fee,

          submitted_total_amount,

          payment_method,

        });

      /**
       * RESPONSE
       */

      res.json(result);

    } catch (error) {

      console.error(

        "checkout validate error:",

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
 * CREATE CHECKOUT
 * ============================================
 */

router.post(

  "/create",

  async (req, res) => {

    try {

      const {

        user_id,

        customer_name,

        customer_phone,

        shipping_address,
      order_type,

        destination_latitude,

        destination_longitude,

        items,

        submitted_shipping_fee,

        submitted_total_amount,

        payment_method,

        payment_provider,

      } = req.body;

      /**
       * ============================================
       * VALIDATE CHECKOUT
       * ============================================
       */

      const validationResult =

        await validateCheckout({

          items,

          destination_latitude,

          destination_longitude,

          submitted_shipping_fee,

          submitted_total_amount,

          payment_method,

        });

      /**
       * VALIDATION FAILED
       */

      if (
        !validationResult.success
      ) {

        return res.status(400).json(

          validationResult

        );

      }

      /**
       * ============================================
       * CREATE PAYMENT SESSION
       * ============================================
       */

      const paymentResult =

        await createPaymentSession({

          user_id,

          payment_provider,

          payment_method,

          amount:

            validationResult.total_amount,

          cart_snapshot: {

            user_id,

            customer_name,

            customer_phone,

            shipping_address,
      order_type,

            destination_latitude,

            destination_longitude,

            items,

            subtotal:

              validationResult.subtotal,

            shipping_fee:

              validationResult.shipping_fee,

            shipping_distance:

              validationResult.distance_km,

            total_amount:

              validationResult.total_amount,

          },

        });

      /**
       * RESPONSE
       */

      res.json({

        success: true,

        checkout_validated:
          true,

        subtotal:

          validationResult.subtotal,

        shipping_fee:

          validationResult.shipping_fee,

        total_amount:

          validationResult.total_amount,

        distance_km:

          validationResult.distance_km,

        free_shipping:

          validationResult.free_shipping,

        duration_text:

          validationResult.duration_text,

        payment:

          paymentResult,

      });

    } catch (error) {

      console.error(

        "checkout create error:",

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
