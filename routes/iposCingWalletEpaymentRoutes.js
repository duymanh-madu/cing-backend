"use strict";

const express =
  require("express");

const {
  assertPosEpaymentEnabled,
  assertIposEpaymentCredential,
  createIposPosPayment,
  queryIposPosPayment,
} = require(
  "../services/wallet/cingWalletPosPaymentService"
);

const router =
  express.Router();


function sendError(
  res,
  error
) {
  return res
    .status(
      Number(
        error?.statusCode
      ) || 500
    )
    .json({
      success:
        false,

      code:
        error?.code ||
        "CING_WALLET_POS_EP_PAYMENT_FAILED",

      message:
        error?.message ||
        "Không thể xử lý Cing Wallet Epayment",
    });
}


function requireIposCredential(
  req,
  res,
  next
) {
  try {
    assertPosEpaymentEnabled();

    const credential =
      req.get(
        "x-cing-wallet-epayment-key"
      );

    assertIposEpaymentCredential(
      credential
    );

    next();
  } catch (error) {
    return sendError(
      res,
      error
    );
  }
}


router.post(
  "/create",
  requireIposCredential,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await createIposPosPayment({
          transactionId:
            req.body?.transaction_id,

          posParent:
            req.body?.pos_parent,

          posId:
            req.body?.pos_id,

          billReference:
            req.body?.bill_reference,

          amount:
            req.body?.amount,

          ttlSeconds:
            req.body?.ttl_seconds,
        });

      return res.json({
        success:
          true,

        data,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  }
);


router.post(
  "/query",
  requireIposCredential,
  async (
    req,
    res
  ) => {
    try {
      const data =
        await queryIposPosPayment({
          transactionId:
            req.body?.transaction_id,

          posParent:
            req.body?.pos_parent,

          posId:
            req.body?.pos_id,
        });

      return res.json({
        success:
          true,

        data,
      });
    } catch (error) {
      return sendError(
        res,
        error
      );
    }
  }
);


module.exports =
  router;
