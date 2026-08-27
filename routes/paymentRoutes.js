const express =
  require("express");

const router =
  express.Router();

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

const {
  normalizePhone,
} = require(
  "../utils/phoneIdentity"
);

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
  authMiddleware,
  async (
    req,
    res
  ) => {

    try {

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

      const result =

        await createPaymentSession({
          ...req.body,

          user_id:
            canonicalUserId,

          customer_phone:
            canonicalUserId,

          payment_purpose:
            "order",
        });

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

module.exports =
  router;