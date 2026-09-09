const express =
  require("express");

const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

const {
  createWalletTopupSession,
} = require(
  "../services/wallet/cingWalletTopupSessionService"
);

const {
  getCustomerTopupPromotion,
} = require(
  "../services/wallet/cingWalletTopupPromotionReadService"
);

const {
  getWalletOverview,
  getWalletTransactions,
} = require(
  "../services/wallet/cingWalletReadService"
);


const {
  buyGamePlaysWithWallet,
} = require(
  "../services/wallet/cingWalletBuyGamePlaysService"
);

const {
  previewCustomerPosPayment,
  confirmCustomerPosPayment,
} = require(
  "../services/wallet/cingWalletPosPaymentService"
);

const router =
  express.Router();


function sendWalletError(
  res,
  error
) {
  const statusCode =
    Number(
      error?.statusCode
    ) || 500;

  return res
    .status(
      statusCode
    )
    .json({
      success: false,

      code:
        error?.code ||
        "CING_WALLET_TOPUP_SESSION_FAILED",

      message:
        error?.message ||
        "Không thể tạo phiên nạp Cing Wallet",
    });
}


/*
 * =====================================================
 * POST /api/wallet/topup/session
 * =====================================================
 *
 * Client authority:
 * - amount only
 *
 * Backend authority:
 * - authenticated customer
 * - canonical Wallet user_id
 * - payment purpose
 * - payment provider
 * - payment method
 */
/*
 * =====================================================
 * GET /api/wallet
 * =====================================================
 *
 * Returns authenticated customer's effective Wallet
 * balance plus the first statement page.
 *
 * No user_id is accepted from query/body/params.
 */
router.get(
  "/",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await getWalletOverview({
          customer:
            req.customer,

          historyLimit:
            req.query?.limit,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendWalletError(
        res,
        error
      );
    }
  }
);


/*
 * =====================================================
 * GET /api/wallet/transactions
 * =====================================================
 *
 * Stable keyset-paginated statement for authenticated
 * customer only.
 */
router.get(
  "/transactions",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await getWalletTransactions({
          customer:
            req.customer,

          limit:
            req.query?.limit,

          cursor:
            req.query?.cursor,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendWalletError(
        res,
        error
      );
    }
  }
);


/*
 * =====================================================
 * GET /api/wallet/topup/promotion
 * =====================================================
 *
 * Customer-safe projection of the currently active
 * Wallet top-up promotion.
 *
 * Disabled, expired and future campaigns are hidden.
 * No financial mutation occurs here.
 */
router.get(
  "/topup/promotion",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await getCustomerTopupPromotion();

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendWalletError(
        res,
        error
      );
    }
  }
);


router.post(
  "/topup/session",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await createWalletTopupSession({
          customer:
            req.customer,

          amount:
            req.body?.amount,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return sendWalletError(
        res,
        error
      );
    }
  }
);


/*
 * =====================================================
 * POST /api/wallet/buy-plays
 * =====================================================
 *
 * Client authority:
 * - quantity
 * - stable request_id
 *
 * Backend authority:
 * - authenticated customer identity
 * - canonical Wallet user_id
 * - Wallet play unit price
 * - total cost
 * - Wallet balance mutation
 * - game-play balance mutation
 *
 * No user_id / amount / price is accepted from client.
 */
/*
 * =====================================================
 * GET /api/wallet/pos-pay/:capability
 * =====================================================
 *
 * Customer identity comes only from authMiddleware.
 * Amount comes only from PostgreSQL payment intent.
 */
router.get(
  "/pos-pay/:capability",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await previewCustomerPosPayment({
          customer:
            req.customer,

          capability:
            req.params?.capability,
        });

      return res.json({
        success:
          true,

        data,
      });
    } catch (error) {
      return sendWalletError(
        res,
        error
      );
    }
  }
);


/*
 * =====================================================
 * POST /api/wallet/pos-pay/:capability/confirm
 * =====================================================
 *
 * Caller cannot supply user_id or amount.
 */
router.post(
  "/pos-pay/:capability/confirm",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await confirmCustomerPosPayment({
          customer:
            req.customer,

          capability:
            req.params?.capability,
        });

      return res.json({
        success:
          true,

        data,
      });
    } catch (error) {
      return sendWalletError(
        res,
        error
      );
    }
  }
);


router.post(
  "/buy-plays",
  authMiddleware,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await buyGamePlaysWithWallet({
          customer:
            req.customer,

          quantity:
            req.body?.quantity,

          requestId:
            req.body?.request_id,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      const statusCode =
        Number(
          error?.statusCode
        ) || 500;

      return res
        .status(
          statusCode
        )
        .json({
          success: false,

          code:
            error?.code ||
            "CING_WALLET_PLAY_PURCHASE_FAILED",

          message:
            error?.message ||
            "Không thể mua lượt chơi bằng Cing Wallet",
        });
    }
  }
);


module.exports =
  router;
