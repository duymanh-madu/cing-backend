const express =
  require("express");

const router =
  express.Router();

const {

  createPaymentSession,

  verifyPayment,

  expireOldPayments,

} = require(
  "../services/paymentService"
);

const supabase =
  require("../supabase");

  const {
  verifyWebhookSignature,
  logWebhook,
  isDuplicateWebhook,
} = require(
  "../services/paymentWebhookService"
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
        "payment routes working",

    });

  }
);

/**
 * ============================================
 * CREATE PAYMENT SESSION
 * ============================================
 */

router.post(

  "/create-session",

  async (req, res) => {

    try {

      const result =

        await createPaymentSession(
          req.body
        );

      res.json(
        result
      );

    } catch (error) {

      console.log(error);

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
 * VERIFY PAYMENT
 * ============================================
 */

router.post(

  "/verify",

  async (req, res) => {

    try {

      const {

        transaction_code,

        provider_transaction_id,

      } = req.body;

      if (
        !transaction_code
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Missing transaction_code",

        });

      }

      const result =

        await verifyPayment({

          transaction_code,

          provider_transaction_id,

        });

      res.json(
        result
      );

    } catch (error) {

      console.log(error);

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
 * GET PAYMENT STATUS
 * ============================================
 */

router.get(

  "/status/:transactionCode",

  async (req, res) => {

    try {

      const {
        transactionCode,
      } = req.params;

      const {

        data,
        error,

      } = await supabase

        .from(
          "payment_transactions"
        )

        .select("*")

        .eq(
          "transaction_code",
          transactionCode
        )

        .maybeSingle();

      if (error) {

        throw new Error(
          error.message
        );

      }

      if (!data) {

        return res.status(404).json({

          success: false,

          message:
            "Payment not found",

        });

      }

      res.json({

        success: true,

        payment:
          data,

      });

    } catch (error) {

      console.log(error);

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
 * EXPIRE PAYMENTS
 * ============================================
 */

router.post(

  "/expire",

  async (req, res) => {

    try {

      await expireOldPayments();

      res.json({

        success: true,

      });

    } catch (error) {

      console.log(error);

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
 * WEBHOOK
 * ============================================
 */

router.post(

  "/webhook",

  async (req, res) => {

    try {

      const signature =

        req.headers[
          "x-signature"
        ];

      const raw_body =

        JSON.stringify(
          req.body
        );

      const {

        transaction_code,

        provider_transaction_id,

        payment_provider,

      } = req.body;

      /**
       * VALIDATE
       */

      if (
        !transaction_code
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Missing transaction_code",

        });

      }

      /**
       * DUPLICATE CHECK
       */

      const duplicated =

        await isDuplicateWebhook({

          transaction_code,

          payment_provider:
            payment_provider ||
            "banking",

        });

      if (duplicated) {

        return res.json({

          success: true,

          duplicated: true,

        });

      }

      /**
       * VERIFY SIGNATURE
       */

      const verified =

        verifyWebhookSignature({

          raw_body,

          signature,

          secret:
            process.env
              .PAYMENT_WEBHOOK_SECRET ||

            "demo-secret",

        });

      /**
       * LOG WEBHOOK
       */

      await logWebhook({

        transaction_code,

        payment_provider:
          payment_provider ||
          "banking",

        webhook_type:
          "payment_callback",

        webhook_signature:
          signature,

        signature_verified:
          verified,

        request_headers:
          req.headers,

        request_body:
          req.body,

        processing_status:
          verified
            ? "processed"
            : "rejected",

        processing_error:
          verified
            ? null
            : "Invalid signature",

      });

      /**
       * INVALID SIGNATURE
       */

      if (!verified) {

        return res.status(401).json({

          success: false,

          message:
            "Invalid signature",

        });

      }

      /**
       * VERIFY PAYMENT
       */

      const result =

        await verifyPayment({

          transaction_code,

          provider_transaction_id,

        });

      /**
       * RESPONSE
       */

      res.json({

        success: true,

        webhook: true,

        result,

      });

    } catch (error) {

      console.log(error);

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
 * EXPORT
 * ============================================
 */

module.exports = router;