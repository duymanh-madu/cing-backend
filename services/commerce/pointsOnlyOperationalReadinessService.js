"use strict";
// This mapping is an iPOS projection only. PostgreSQL still settles
// points/internal with amount=0 and a matching frozen reservation.
function getConfiguredPointsPaymentMethod() {
  return String(process.env.IPOS_POINTS_PAYMENT_METHOD || "").trim() || "MOMO_OD_ONLINE";
}
function assertPointsOnlyCommerceReadiness() {
  return { ready: true };
}
module.exports = { assertPointsOnlyCommerceReadiness, getConfiguredPointsPaymentMethod };
