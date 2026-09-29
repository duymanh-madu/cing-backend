const {
  sendLegacyGamePlaysClosed,
} = require(
  "../services/games/revival/cingLegacyGamePlaysCutoverGuard"
);

const {
  readCommittedWalletPlayPurchase,
} = require(
  "../services/wallet/cingWalletLegacyPlayReplayReadService"
);
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
  previewCustomerPosPayment,
  confirmCustomerPosPayment,
} = require(
  "../services/wallet/cingWalletPosPaymentService"
);

const {
  projectPaidPaymentToPosSession,
} = require(
  "../services/wallet/cingWalletPosSessionService"
);

const {
  buyReviveCreditsWithWallet,
} = require(
  "../services/wallet/cingWalletBuyReviveCreditsService"
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

      /*
       * Wallet settlement above is already canonical and committed.
       *
       * POS projection is intentionally secondary. A projection
       * failure must NEVER turn a successful Wallet debit into an
       * HTTP payment failure or invite the customer to pay twice.
       *
       * Event 11 reconciliation can later self-heal this state.
       */
      try {
        await projectPaidPaymentToPosSession({
          paymentIntentId:
            data.intent_id,
        });
      } catch (
        projectionError
      ) {
        console.error(
          "[CING WALLET POS] Paid projection failed after committed settlement:",
          {
            intent_id:
              data.intent_id,

            wallet_transaction_id:
              data.wallet_transaction_id,

            error:
              projectionError.message,
          }
        );
      }

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
      /*
       * V1 purchase authority is permanently retired.
       *
       * This URL remains only so a stale client can retrieve
       * the exact receipt of a Wallet play purchase that had
       * already committed before the cutover.
       *
       * readCommittedWalletPlayPurchase is read-only:
       * no Wallet debit, no play credit, no financial RPC.
       */
      const replay =
        await readCommittedWalletPlayPurchase({
          customer:
            req.customer,

          quantity:
            req.body?.quantity,

          requestId:
            req.body?.request_id,
        });

      if (!replay) {
        return sendLegacyGamePlaysClosed(
          res
        );
      }

      return res.json({
        success:
          true,

        data:
          replay,
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
          success:
            false,

          code:
            error?.code ||
            "CING_WALLET_PLAY_REPLAY_FAILED",

          message:
            error?.message ||
            "Không thể xác minh giao dịch lượt chơi cũ",
        });
    }
  }
);


/*
 * POST /api/wallet/buy-revive-credits
 * Client: quantity and stable request_id only.
 * Identity: authMiddleware / req.customer.
 * Price and settlement: PostgreSQL.
 */
router.post(
  "/buy-revive-credits",
  authMiddleware,
  async (req, res) => {
    try {
      const data =
        await buyReviveCreditsWithWallet({
          customer: req.customer,
          quantity: req.body?.quantity,
          requestId: req.body?.request_id,
        });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return res
        .status(Number(error?.statusCode) || 500)
        .json({
          success: false,
          code:
            error?.code ||
            "REVIVE_PURCHASE_FAILED",
          message:
            error?.message ||
            "Không thể mua Revive Credit lúc này",
        });
    }
  }
);

module.exports =
  router;
