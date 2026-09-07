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

    /*
     * Deprecated public financial entrypoint.
     *
     * Commerce order payments must enter exclusively through:
     *
     *   POST /api/checkout/create
     *
     * That route owns canonical:
     *
     * - customer identity
     * - merchandise pricing
     * - fulfillment / shipping
     * - membership tier
     * - vouchers
     * - loyalty redemption
     * - payment remainder
     * - payment tender
     * - frozen cart snapshot
     *
     * This route must never:
     *
     * - spread req.body into payment authority
     * - create payment_transactions
     * - reserve loyalty points
     * - invoke Wallet settlement
     * - invoke an external provider
     *
     * Keep authentication and canonical identity resolution so
     * the deprecated endpoint remains fail-closed behind the same
     * customer boundary while old clients are being retired.
     */
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


    return res
      .status(410)
      .json({

        success: false,

        code:
          "COMMERCE_CHECKOUT_ENDPOINT_REQUIRED",

        error:
          "Phiên thanh toán đơn hàng phải được tạo qua checkout chuẩn",

        checkout_endpoint:
          "/api/checkout/create",

      });

  }
);


/**
 * =====================================================
 * RECOVER PAYMENT
 * =====================================================
 */

router.get(
  "/recover/:transactionCode",
  authMiddleware,
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

          customer:
            req.customer,

        });

      return res.json({

        success: true,

        data:
          result,

      });

    } catch (error) {

      return res
        .status(
          Number(
            error?.statusCode
          ) || 500
        )
        .json({

          success: false,

          code:
            error?.code ||
            "PAYMENT_RECOVERY_FAILED",

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
  authMiddleware,
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

          customer:
            req.customer,

        });

      return res.json({

        success: true,

        data:
          result,

      });

    } catch (error) {

      return res
        .status(
          Number(
            error?.statusCode
          ) || 500
        )
        .json({

          success: false,

          code:
            error?.code ||
            "PAYMENT_RECONCILIATION_FAILED",

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