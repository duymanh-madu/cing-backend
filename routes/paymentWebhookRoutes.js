const express =
  require("express");

const router =
  express.Router();

const {
  verifyPayment,
} = require(
  "../services/paymentVerificationService"
);

/**
 * ========================================
 * BANK WEBHOOK
 * ========================================
 */

router.post(

  "/bank-transfer",

  async (
    req,
    res
  ) => {

    try {

      const {

        transaction_code,

        provider_transaction_id,

      } = req.body;

      /**
       * VALIDATE
       */

      if (
        !transaction_code
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "transaction_code required",

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

      return res
        .status(200)
        .json({

          success:
            true,

          message:
            "Payment verified",

          data:
            result,

        });

    } catch (error) {

      console.error(

        "bank webhook error:",

        error.message

      );

      return res
        .status(500)
        .json({

          success:
            false,

          message:
            error.message,

        });

    }

  }
);

/**
 * ========================================
 * MOMO WEBHOOK
 * ========================================
 */

router.post(

  "/momo",

  async (
    req,
    res
  ) => {

    try {

      const {

        orderId,

        transId,

      } = req.body;

      /**
       * VALIDATE
       */

      if (!orderId) {

        return res
          .status(400)
          .json({

            success:
              false,

            message:
              "orderId required",

          });

      }

      /**
       * VERIFY
       */

      const result =
        await verifyPayment({

          transaction_code:
            orderId,

          provider_transaction_id:
            transId,

        });

      return res
        .status(200)
        .json({

          success:
            true,

          message:
            "MoMo payment verified",

          data:
            result,

        });

    } catch (error) {

      console.error(

        "momo webhook error:",

        error.message

      );

      return res
        .status(500)
        .json({

          success:
            false,

          message:
            error.message,

        });

    }

  }
);

module.exports =
  router;