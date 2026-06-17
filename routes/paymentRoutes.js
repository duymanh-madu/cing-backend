const express =
  require("express");

const router =
  express.Router();

const {
  createPaymentSession,
} = require(
  "../services/payment/paymentOrchestratorService"
);

const {
  recoverPayment,
} = require(
  "../services/payment/paymentRecoveryService"
);

const {
  reconcilePayment,
} = require(
  "../services/payment/paymentReconciliationService"
);

/**
 * =====================================================
 * TEST
 * =====================================================
 */

router.get(
  "/test",
  (
    req,
    res
  ) => {

    return res.json({

      success: true,

      route:
        "payment routes working",

      payment: true,

      realtime: true,

      timestamp:
        Date.now(),

    });

  }
);

/**
 * =====================================================
 * CREATE PAYMENT SESSION
 * =====================================================
 */

router.post(
  "/create-session",
  async (
    req,
    res
  ) => {

    try {

      const result =

        await createPaymentSession(
          req.body
        );

      return res.json(
        result
      );

    } catch (error) {

      console.log(
        error.message
      );

      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * =====================================================
 * RECOVER PAYMENT
 * =====================================================
 */

router.get(
  "/recover/:transactionCode",
  async (
    req,
    res
  ) => {

    try {

      const result =

        await recoverPayment({

          transaction_code:
            req.params
              .transactionCode,

        });

      return res.json({

        success: true,

        data:
          result,

      });

    } catch (error) {

      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * =====================================================
 * RECONCILE PAYMENT
 * =====================================================
 */

router.post(
  "/reconcile/:transactionCode",
  async (
    req,
    res
  ) => {

    try {

      const result =

        await reconcilePayment({

          transaction_code:
            req.params
              .transactionCode,

        });

      return res.json({

        success: true,

        data:
          result,

      });

    } catch (error) {

      return res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }
);

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */


// POST /payments/zalo/debug — temporary checkout SDK debug log
router.post("/zalo/debug", async (req, res) => {
  try {
    console.log("[ZALO CHECKOUT DEBUG]", JSON.stringify(req.body || {}, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports =
  router;