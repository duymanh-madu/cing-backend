const { realtimeEventBus } = require("../realtime/realtimeEventBus");

function emitPaymentStatus({ transaction_code, payment_status, metadata }) {
  try {
    realtimeEventBus.publish({
      event: "payment.status.updated",
      delivery_type: "BROADCAST",
      payload: { transaction_code, payment_status, metadata },
      channel: "payment",
      timestamp: new Date().toISOString(),
    });
  } catch(e) {
    console.warn("[PAYMENT REALTIME] emit failed:", e.message);
  }
}

module.exports = { emitPaymentStatus };
