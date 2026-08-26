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


module.exports =
  router;
