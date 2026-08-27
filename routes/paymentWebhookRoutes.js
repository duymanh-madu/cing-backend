const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const supabase = require("../supabase");
const {
  verifyMomoSettlement,
} = require("../services/payment/momoSettlementVerifier");
const {
  processPaidOrderSettlement,
} = require("../services/payment/paidOrderSettlementProcessor");

const ZALO_CHECKOUT_PRIVATE_KEY =
  process.env.ZALO_CHECKOUT_PRIVATE_KEY ||
  process.env.ZALO_PRIVATE_KEY ||
  "";

function verifyZaloCheckoutMac(data, mac) {
  if (!ZALO_CHECKOUT_PRIVATE_KEY) {
    throw new Error("Missing ZALO_CHECKOUT_PRIVATE_KEY");
  }

  const dataForMac =
    `appId=${data.appId}` +
    `&amount=${data.amount}` +
    `&description=${data.description}` +
    `&orderId=${data.orderId}` +
    `&message=${data.message}` +
    `&resultCode=${data.resultCode}` +
    `&transId=${data.transId}`;

  const expected = crypto
    .createHmac("sha256", ZALO_CHECKOUT_PRIVATE_KEY)
    .update(dataForMac)
    .digest("hex");

  return expected === mac;
}





async function processNormalizedPaymentResult({
  req,
  resultCode,
  orderId,
  transId,
  amount,
  message,
}) {
  if (resultCode !== 0) {
    await supabase
      .from("payment_transactions")
      .update({
        payment_status:
          "failed",
        failure_reason:
          message,
      })
      .eq(
        "transaction_code",
        orderId
      );

    return {
      success: true,
      processed: false,
      payment_failed: true,
    };
  }

  await processPaidOrderSettlement({
    req,
    orderId,
    transId,
    amount,
  });

  return {
    success: true,
    processed: true,
    payment_failed: false,
  };
}

const momoIpnHandler = async (
  req,
  res
) => {
  let verified;

  try {
    verified =
      verifyMomoSettlement(
        req.body
      );
  } catch (error) {
    console.warn(
      "[MOMO IPN] Verification rejected:",
      error.message
    );

    return res.status(400).json({
      success: false,
      error:
        "INVALID_MOMO_SETTLEMENT",
    });
  }

  console.log(
    "[MOMO IPN] verified",
    {
      resultCode:
        verified.resultCode,
      orderId:
        verified.transactionCode,
      transId:
        verified.providerTransactionId,
      amount:
        verified.amount,
    }
  );

  const {
    data: payment,
    error: paymentError,
  } = await supabase
    .from(
      "payment_transactions"
    )
    .select(
      [
        "id",
        "transaction_code",
        "payment_provider",
        "payment_purpose",
        "payment_status",
        "amount",
        "provider_transaction_id",
        "settlement_verified_at",
        "settlement_reference",
        "order_created",
      ].join(",")
    )
    .eq(
      "transaction_code",
      verified.transactionCode
    )
    .maybeSingle();

  if (paymentError) {
    console.error(
      "[MOMO IPN] Payment lookup failed:",
      paymentError.message
    );

    return res.status(500).json({
      success: false,
      error:
        "PAYMENT_LOOKUP_FAILED",
    });
  }

  if (!payment) {
    return res.status(404).json({
      success: false,
      error:
        "PAYMENT_NOT_FOUND",
    });
  }

  if (
    payment.payment_provider !==
    "momo"
  ) {
    return res.status(409).json({
      success: false,
      error:
        "PAYMENT_PROVIDER_MISMATCH",
    });
  }

  const storedAmount =
    Number(
      payment.amount
    );

  if (
    !Number.isSafeInteger(
      storedAmount
    ) ||
    storedAmount !==
      verified.amount
  ) {
    return res.status(409).json({
      success: false,
      error:
        "PAYMENT_AMOUNT_MISMATCH",
    });
  }

  /*
   * provider_transaction_id may contain the provider requestId
   * while the payment is still pending.
   *
   * The final settlement identity is transId. Rebinding is
   * forbidden only after a durable verified settlement already
   * exists.
   */
  if (
    payment.settlement_verified_at &&
    (
      !payment.settlement_reference ||
      String(
        payment.settlement_reference
      ) !==
        String(
          verified.providerTransactionId
        )
    )
  ) {
    return res.status(409).json({
      success: false,
      error:
        "PROVIDER_TRANSACTION_MISMATCH",
    });
  }

  const now =
    new Date().toISOString();

  /*
   * A valid signed callback may represent either success
   * or provider-declared failure.
   *
   * Both are authentic provider results, but only success
   * receives settlement proof and enters paid processing.
   */
  if (!verified.succeeded) {
    const {
      error: failedUpdateError,
    } = await supabase
      .from(
        "payment_transactions"
      )
      .update({
        payment_status:
          "failed",
        provider_transaction_id:
          String(
            verified.providerTransactionId
          ),
        callback_received:
          true,
        webhook_verified:
          true,
        failure_reason:
          verified.payload.message ||
          `MoMo resultCode ${verified.resultCode}`,
      })
      .eq(
        "id",
        payment.id
      );

    if (failedUpdateError) {
      console.error(
        "[MOMO IPN] Failed result persistence error:",
        failedUpdateError.message
      );

      return res.status(500).json({
        success: false,
        error:
          "PAYMENT_FAILED_RESULT_PERSISTENCE_FAILED",
      });
    }

    /*
     * Authentic provider failure is now durable.
     *
     * MoMo IPN contract requires HTTP 204 No Content.
     */
    return res
      .status(204)
      .send();
  }

  const {
    error: verifiedUpdateError,
  } = await supabase
    .from(
      "payment_transactions"
    )
    .update({
      payment_status:
        "paid",
      provider_transaction_id:
        String(
          verified.providerTransactionId
        ),
      callback_received:
        true,
      webhook_verified:
        true,
      paid_at:
        now,
      settlement_verified_at:
        now,
      settlement_verification_method:
        verified.verificationMethod,
      settlement_reference:
        String(
          verified.settlementReference
        ),
    })
    .eq(
      "id",
      payment.id
    );

  if (verifiedUpdateError) {
    console.error(
      "[MOMO IPN] Settlement proof persistence failed:",
      verifiedUpdateError.message
    );

    return res.status(500).json({
      success: false,
      error:
        "SETTLEMENT_PROOF_PERSISTENCE_FAILED",
    });
  }

  /*
   * Wallet top-up has its own bounded PostgreSQL authority.
   *
   * Provider settlement proof is already durable at this point.
   * The database RPC derives user + amount exclusively from the
   * authoritative payment row, serializes concurrent settlement,
   * performs the Wallet ledger/balance mutation atomically, and
   * marks settlement_consumed_at in the same transaction.
   *
   * Do NOT ACK MoMo before this RPC succeeds. If settlement fails,
   * MoMo must be allowed to retry. The RPC is durably idempotent,
   * so a retry after successful commit cannot credit twice.
   *
   * Wallet top-up must never enter the commerce order pipeline.
   */
  if (
    payment.payment_purpose ===
    "wallet_topup"
  ) {
    const {
      error: walletTopupSettlementError,
    } = await supabase.rpc(
      "cing_wallet_settle_verified_topup_atomic",
      {
        p_payment_transaction_id:
          payment.id,
      }
    );

    if (
      walletTopupSettlementError
    ) {
      console.error(
        "[MOMO IPN] Wallet top-up settlement failed:",
        walletTopupSettlementError.message
      );

      return res.status(500).json({
        success: false,
        error:
          "WALLET_TOPUP_SETTLEMENT_FAILED",
      });
    }

    /*
     * External payment + Wallet credit are now durable.
     *
     * MoMo IPN contract: HTTP 204 No Content.
     */
    return res
      .status(204)
      .send();
  }

  if (
    payment.payment_purpose !==
    "order"
  ) {
    return res.status(409).json({
      success: false,
      error:
        "PAYMENT_PURPOSE_INVALID",
    });
  }

  /*
   * Durable provider proof is now committed.
   *
   * ACK MoMo before the long commerce pipeline so iPOS,
   * CRM, loyalty, notifications, or realtime latency cannot
   * cause provider timeout/retry.
   *
   * This intentionally preserves the production timing
   * behavior that existed before Verified Webhook V1.
   */
  res
    .status(204)
    .send();

  await processNormalizedPaymentResult({
    req,
    resultCode:
      0,
    orderId:
      verified.transactionCode,
    transId:
      verified.providerTransactionId,
    amount:
      verified.amount,
    message:
      verified.payload.message,
  });

  return;
};

router.post("/momo", momoIpnHandler);

/**
 * =====================================================
 * ZALO CHECKOUT SDK CALLBACK / CONFIRM
 * =====================================================
 * Zalo Checkout SDK đi qua MoMo nhưng không gọi MoMo direct từ Mini App.
 * Endpoint này tái sử dụng 100% pipeline MoMo IPN hiện tại:
 * - payment_transactions
 * - orders
 * - iPOS
 * - CRM spending
 * - loyalty points
 * - game plays
 * - leaderboard
 * - notifications
 * - realtime
 */
function parseZaloCheckoutExtraData(extradata) {
  if (!extradata) return {};

  try {
    const raw =
      typeof extradata === "string"
        ? extradata
        : JSON.stringify(extradata);

    const decoded = raw.includes("%")
      ? decodeURIComponent(raw)
      : raw;

    const parsed = JSON.parse(decoded);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn("[ZALO CHECKOUT] Failed to parse extradata:", err.message);
    return {};
  }
}

async function processZaloCheckoutAsPaid(req, res) {
  try {
    const body = req.body || {};
    const data = body.data || body;
    const extraData = parseZaloCheckoutExtraData(data.extradata || body.extradata);

    // Zalo/MoMo orderId is provider order id.
    // Internal transaction_code is stored inside extradata and must be used for payment_transactions lookup.
    const orderId =
      extraData.transaction_code ||
      extraData.transactionCode ||
      data.transaction_code ||
      data.transactionCode ||
      data.orderId;

    const providerOrderId = data.orderId || body.orderId;
    const resultCode = Number(data.resultCode);
    const transId = data.transId || data.transactionId || providerOrderId || orderId;
    const amount = Number(data.amount || 0);
    const message = data.message || body.message || data.msg || "Zalo Checkout result";

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing orderId",
      });
    }

    console.log("[ZALO CHECKOUT] normalized callback", {
      internalOrderId: orderId,
      providerOrderId,
      transId,
      amount,
      resultCode,
      paymentChannel: body.paymentChannel || data.paymentChannel || data.method,
      hasExtraData: !!data.extradata,
    });

    if (body.mac && !verifyZaloCheckoutMac(data, body.mac)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Zalo Checkout callback MAC",
      });
    }

    const { data: payment } = await supabase
      .from("payment_transactions")
      .select("amount")
      .eq("transaction_code", orderId)
      .maybeSingle();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment transaction not found",
      });
    }

    if (Number(payment.amount) !== amount) {
      return res.status(400).json({
        success: false,
        message: "Amount mismatch",
      });
    }

    await processNormalizedPaymentResult({
      req,
      resultCode:
        resultCode === 1
          ? 0
          : -1,
      orderId,
      transId,
      amount,
      message,
    });

    return res.json({
      returnCode: 1,
      returnMessage: "success",
    });
  } catch (err) {
    console.error("[ZALO CHECKOUT] process failed:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}

router.post("/zalo/callback", processZaloCheckoutAsPaid);
router.post("/zalo/sandbox-callback", processZaloCheckoutAsPaid);
router.post("/zalo/confirm", processZaloCheckoutAsPaid);

module.exports = router;