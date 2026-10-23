"use strict";
const FALLBACK = "MOMO_OD_ONLINE";
function isExplicitTenderRejection(data) {
  const error = data?.error;
  if (!error) return false;
  const text = String(error.message || "").toLowerCase();
  return /payment[_ ]?method|paymentinfo|phương thức thanh toán|kênh thanh toán/.test(text)
    && /invalid|unsupported|not support|not accept|không hợp lệ|không hỗ trợ|không chấp nhận/.test(text);
}
async function sendPointsAwareIposOrder({ order, payload, post, onFallback }) {
  let first;
  try { first = await post(payload); }
  catch (error) {
    if (![400, 422].includes(error.response?.status) || !isExplicitTenderRejection(error.response?.data)) throw error;
    first = error.response;
  }
  // Only an explicit tender rejection proves it is safe to send again.
  // Timeouts, business errors and ambiguous failures go to durable recovery.
  if (order.payment_method !== "points" || Number(order.total_amount) !== 0 ||
      payload.PaymentInfo?.Amount !== 0 || payload.PaymentInfo?.Payment_Method === FALLBACK ||
      !isExplicitTenderRejection(first.data)) return first;
  const fallback = { ...payload, PaymentInfo: { ...payload.PaymentInfo, Payment_Method: FALLBACK } };
  await onFallback(fallback);
  return post(fallback);
}
module.exports = { sendPointsAwareIposOrder, isExplicitTenderRejection };
