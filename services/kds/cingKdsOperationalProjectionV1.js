"use strict";

const crypto = require("node:crypto");

const {
  normalizeEvent11
} = require("./cingKdsEvent11NormalizerV1");

const {
  buildIngestionCandidate
} = require("./cingKdsEvent11IngestionV1");

const {
  evaluatePaymentEvidence
} = require("./cingKdsPaymentEvidenceV1");

function stable(value) {
  if (Array.isArray(value)) {
    return "[" + value.map(stable).join(",") + "]";
  }

  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ":" + stable(value[k]))
      .join(",") + "}";
  }

  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash("sha256")
    .update(stable(value))
    .digest("hex");
}

function buildOperationalProjection(body) {
  const order = normalizeEvent11(body);
  const candidate = buildIngestionCandidate(body);
  const evidence = evaluatePaymentEvidence(body);

  const sale = body.sale_manager;

  // Exclude member IDs, payment trace IDs,
  // phone numbers, addresses and raw webhook.
  const paymentSnapshot = {
    total_amount: evidence.amount_summary.total_amount,
    payment_amount: evidence.amount_summary.payment_amount,
    methods: Array.isArray(sale.payment_info)
      ? sale.payment_info.map(p => ({
          method_id: p && typeof p === "object"
            ? String(p.method_id ?? "")
            : "",
          amount: p && typeof p === "object"
            ? p.amount ?? null
            : null
        }))
      : null,
    evidence_status: evidence.evidence_status,
    reasons: evidence.reasons
  };

  return {
    identity: {
      pos_parent: order.pos_parent,
      pos_id: order.pos_id,
      tran_id: order.tran_id
    },

    operational_fingerprint: candidate.fingerprint,
    payment_evidence_fingerprint: hash(paymentSnapshot),

    // These values are not parsed or timezone-converted.
    tran_date_raw: order.tran_date_raw,
    hub_created_at_raw: order.hub_created_at_raw,

    // Never assume payment has been confirmed.
    payment_verification: "pending_verification",
    evidence_status: evidence.evidence_status,

    // No order is eligible for the live KDS queue yet.
    eligible_for_kds: false,

    cup_count: order.total_cups,

    cups: order.cups.map(c => ({
      unit_key: c.unit_key,
      item_id: c.item_id,
      item_name: c.item_name,
      status: "pending",
      version: 0
    }))
  };
}

function compareProjections(previous, incoming) {
  if (!previous || !incoming) {
    throw new Error("KDS_PROJECTION_REQUIRED");
  }

  if (
    previous.identity.pos_parent !==
      incoming.identity.pos_parent ||
    previous.identity.pos_id !==
      incoming.identity.pos_id ||
    previous.identity.tran_id !==
      incoming.identity.tran_id
  ) {
    throw new Error("KDS_PROJECTION_IDENTITY_MISMATCH");
  }

  const operationalChanged =
    previous.operational_fingerprint !==
    incoming.operational_fingerprint;

  const paymentChanged =
    previous.payment_evidence_fingerprint !==
    incoming.payment_evidence_fingerprint;

  return {
    operational_changed: operationalChanged,
    payment_evidence_changed: paymentChanged,
    outcome:
      operationalChanged || paymentChanged
        ? "review_required"
        : "duplicate"
  };
}

module.exports = {
  buildOperationalProjection,
  compareProjections
};
