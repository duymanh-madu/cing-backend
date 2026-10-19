"use strict";

const {
  normalizeEvent11
} = require("./cingKdsEvent11NormalizerV1");

function parseMoney(value) {
  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    !/^\d+(?:\.\d+)?$/.test(value.trim())
  ) {
    return null;
  }

  const n = Number(value);

  if (
    !Number.isSafeInteger(n) ||
    n < 0
  ) {
    return null;
  }

  return n;
}

function evaluatePaymentEvidence(body) {
  // Validate canonical Event 11 and its order lines.
  const order = normalizeEvent11(body);
  const sale = body.sale_manager;

  const reasons = [];

  const total = parseMoney(sale.total_amount);

  if (total === null) {
    reasons.push("INVALID_TOTAL_AMOUNT");
  }

  const payments = sale.payment_info;

  if (
    !Array.isArray(payments) ||
    payments.length === 0
  ) {
    reasons.push("PAYMENT_INFO_MISSING");
  }

  let paymentTotal = 0;
  let paymentValid =
    Array.isArray(payments) &&
    payments.length > 0;

  if (paymentValid) {
    for (const payment of payments) {
      if (
        !payment ||
        typeof payment !== "object" ||
        Array.isArray(payment)
      ) {
        paymentValid = false;
        break;
      }

      const amount = parseMoney(payment.amount);

      if (
        amount === null ||
        !String(payment.method_id || "").trim()
      ) {
        paymentValid = false;
        break;
      }

      paymentTotal += amount;

      if (!Number.isSafeInteger(paymentTotal)) {
        paymentValid = false;
        break;
      }
    }

    if (!paymentValid) {
      reasons.push("PAYMENT_INFO_INVALID");
    }
  }

  if (
    paymentValid &&
    total !== null &&
    paymentTotal !== total
  ) {
    reasons.push("PAYMENT_AMOUNT_MISMATCH");
  }

  if (total === 0) {
    reasons.push("ZERO_AMOUNT_REQUIRES_REVIEW");
  }

  return {
    source: "ipos_event_11",
    pos_parent: order.pos_parent,
    pos_id: order.pos_id,
    tran_id: order.tran_id,

    evidence_status:
      reasons.length === 0
        ? "structurally_consistent"
        : "review_required",

    reasons,

    // This module never authorizes payment.
    payment_verification: "pending_verification",

    // No customer identifiers or payment traces.
    amount_summary: {
      total_amount: total,
      payment_amount:
        paymentValid ? paymentTotal : null
    }
  };
}

module.exports = {
  evaluatePaymentEvidence
};
