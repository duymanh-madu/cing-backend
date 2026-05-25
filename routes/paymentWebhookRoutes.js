const express = require("express");
const router = express.Router();
const { verifyPayment } = require("../services/payment/paymentVerificationService");
const { executePaymentOrderPipeline } = require("../services/payment/paymentOrderOrchestratorService");
const supabase = require("../supabase");

/**
 * POST /api/payment/webhook/momo
 * MoMo IPN callback sau khi thanh toan
 */
router.post("/momo", async (req, res) => {
  try {
    const { resultCode, orderId, transId, message, amount } = req.body;
    console.log("[MOMO IPN] Received:", { resultCode, orderId, transId, amount });

    // MoMo IPN - kiem tra resultCode
    if (resultCode !== 0) {
      console.log("[MOMO IPN] Payment failed:", message, "orderId:", orderId);
      // Cap nhat payment_transactions thanh failed
      await supabase.from("payment_transactions")
        .update({ payment_status: "failed", failure_reason: message })
        .eq("transaction_code", orderId);
      return res.json({ success: true, message: "Payment not successful" });
    }

    // Kiem tra da xu ly chua
    const { data: existing } = await supabase
      .from("payment_transactions")
      .select("id, payment_status, order_created")
      .eq("transaction_code", orderId)
      .maybeSingle();

    if (existing?.payment_status === "paid" && existing?.order_created === true) {
      console.log("[MOMO IPN] Already processed:", orderId);
      return res.json({ success: true, duplicated: true });
    }

    // Cap nhat payment thanh paid
    await supabase.from("payment_transactions")
      .update({
        payment_status: "paid",
        provider_transaction_id: String(transId),
        callback_received: true,
        webhook_verified: true,
        paid_at: new Date().toISOString(),
      })
      .eq("transaction_code", orderId);

    // Verify va push order len iPOS
    try {
      const payment = await verifyPayment({
        transaction_code: orderId,
        provider_transaction_id: String(transId),
      });
      await executePaymentOrderPipeline({ payment });
      console.log("[MOMO IPN] Order pushed to iPOS successfully for:", orderId);
    } catch(pipelineErr) {
      console.error("[MOMO IPN] Pipeline error:", pipelineErr.message);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("[MOMO IPN] Error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
