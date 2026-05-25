const express =
  require("express");

const router =
  express.Router();

const {
  verifyPayment,
} = require(
  "../services/payment/paymentVerificationService"
);


const {
  isPaymentAlreadyProcessed,
} = require(
  "../services/payment/paymentIdempotencyService"
);

const {
  executePaymentOrderPipeline,
} = require(
  "../services/payment/paymentOrderOrchestratorService"
);


router.post(
  "/momo",
  async (
    req,
    res
  ) => {

    try {

      const raw_body =
        JSON.stringify(
          req.body
        );

      const signature =
        req.headers[
          "x-signature"
        ];

      const verified =

        verifyWebhookSignature({

          raw_body,

          signature,

          secret:
            process.env
              .PAYMENT_WEBHOOK_SECRET,

        });

      if (!verified) {

        

        return res.status(401).json({

          success: false,

          message:
            "Invalid webhook signature",

        });

      }

      const {
        orderId,
        transId,
      } = req.body;

      const alreadyProcessed =

        await isPaymentAlreadyProcessed({

          transaction_code:
            orderId,

        });

      if (
        alreadyProcessed
      ) {

        return res.json({

          success: true,

          duplicated: true,

        });

      }

      const payment =

        await verifyPayment({

          transaction_code:
            orderId,

          provider_transaction_id:
            transId,

        });

      const orderResult =

        await executePaymentOrderPipeline({

          payment,

        });

      console.log("[MOMO IPN] Payment paid:", orderId);

      return res.json({

        success: true,

        payment,

        order:
          orderResult.order,

      });

    } catch (error) {

      console.log("[MOMO IPN] Payment failed:", error.message);

      console.log(
        "MOMO WEBHOOK ERROR:",
        error.message
      );

      return res.status(500).json({

        success: false,

        message:
          error.message,

      });

    }

  }
);

module.exports = router;