const { realtimeEventBus } = require("../realtime/realtimeEventBus");

function broadcastPaymentCreated(data) {
  try {
    realtimeEventBus.publish({
      event: "payment.created",
      delivery_type: "BROADCAST",
      payload: data,
      channel: "payment",
      timestamp: new Date().toISOString(),
    });
  } catch(e) {}
}

function broadcastPaymentStatus(data) {
  try {
    realtimeEventBus.publish({
      event: "payment.status.updated",
      delivery_type: "BROADCAST",
      payload: data,
      channel: "payment",
      timestamp: new Date().toISOString(),
    });
  } catch(e) {}
}

module.exports = { broadcastPaymentCreated, broadcastPaymentStatus };
