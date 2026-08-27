const express = require("express");
const router = express.Router();

const authMiddleware =
  require("./../middlewares/authMiddleware");

const {
  normalizePhone,
} = require(
  "../utils/phoneIdentity"
);

const {
  settleWalletOrderPayment,
} = require(
  "../services/wallet/cingWalletOrderPaymentService"
);

function normalizeOrderType(value, shippingAddress = "") {
  const raw = String(value || "").trim().toLowerCase();

  if (["delivery", "deli", "ship", "shipping"].includes(raw)) return "delivery";
  if (["dine_in", "dinein", "dine-in", "store", "table", "eat_in", "eat-in", "tai_quan", "tại quán", "tai quan"].includes(raw)) return "dine_in";
  if (["pickup", "takeaway", "take_away", "takeout", "mang_ve", "mang về", "mang ve"].includes(raw)) return "pickup";

  return String(shippingAddress || "").trim() ? "delivery" : "pickup";
}

function getIncomingOrderType(req, shippingAddress = "") {
  return normalizeOrderType(
    req.body?.order_type ||
    req.body?.orderType ||
    req.body?.fulfillment_type ||
    req.body?.fulfillmentType,
    shippingAddress
  );
}

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

  authMiddleware,

  async (req, res) => {

    try {

      const {
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

      const canonicalUserId =
        normalizePhone(
          req.customer?.phone || ""
        );

      if (!canonicalUserId) {
        return res
          .status(401)
          .json({
            success: false,
            code:
              "COMMERCE_CUSTOMER_IDENTITY_REQUIRED",
            error:
              "Không xác định được tài khoản thành viên",
          });
      }

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

          user_id:
            canonicalUserId,

          payment_provider,

          payment_method,

          payment_purpose:
            "order",

          total_amount:
            validationResult.total_amount,

          cart_snapshot: {

            user_id:
              canonicalUserId,

            customer_name,

            customer_phone:
              canonicalUserId,

            shipping_address,
            order_type: getIncomingOrderType(req, shipping_address),

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

      if (
        payment_method ===
          "cing_wallet"
      ) {
        const paymentTransactionId =
          paymentResult?.payment?.id;

        if (!paymentTransactionId) {
          const error =
            new Error(
              "WALLET_PAYMENT_TRANSACTION_ID_REQUIRED"
            );

          error.code =
            "WALLET_PAYMENT_TRANSACTION_ID_REQUIRED";

          throw error;
        }

        const walletSettlement =
          await settleWalletOrderPayment({
            req,
            paymentTransactionId,
          });

        return res.json({
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
          wallet_settlement:
            walletSettlement,
        });
      }

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
