"use strict";

const crypto = require("node:crypto");

const {
  normalizeEvent11
} = require("./cingKdsEvent11NormalizerV1");

function stableStringify(value) {
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort()
      .map(key =>
        JSON.stringify(key) + ":" +
        stableStringify(value[key])
      ).join(",") + "}";
  }

  return JSON.stringify(value);
}

function buildIngestionCandidate(body) {
  const order = normalizeEvent11(body);

  // Only non-personal, KDS-relevant attributes are retained.
  // No member identity, payment trace or raw webhook payload.
  const snapshot = {
    pos_parent: order.pos_parent,
    pos_id: order.pos_id,
    pos_name: order.pos_name,
    tran_id: order.tran_id,
    tran_no: order.tran_no,
    tran_date_raw: order.tran_date_raw,
    hub_created_at_raw: order.hub_created_at_raw,
    cups: order.cups.map(c => ({
      unit_key: c.unit_key,
      item_id: c.item_id,
      item_name: c.item_name
    }))
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(stableStringify(snapshot))
    .digest("hex");

  return {
    source: "ipos_event_11",
    pos_parent: order.pos_parent,
    pos_id: order.pos_id,
    tran_id: order.tran_id,
    source_event_id: order.source_event_id,
    fingerprint,
    payment_verification: "pending_verification",
    ingestion_status: "pending",
    snapshot,
    total_cups: order.total_cups
  };
}

// Pure classification only.
// Atomic DB persistence is a separate, future authority.
function classifyExisting(existing, candidate) {
  if (!existing) {
    return { outcome: "new" };
  }

  if (
    existing.pos_parent !== candidate.pos_parent ||
    String(existing.tran_id) !== String(candidate.tran_id)
  ) {
    throw new Error("KDS_IDENTITY_MISMATCH");
  }

  if (existing.fingerprint === candidate.fingerprint) {
    return { outcome: "duplicate" };
  }

  return {
    outcome: "conflict",
    reason: "KDS_TRANSACTION_PAYLOAD_CHANGED"
  };
}

module.exports = {
  buildIngestionCandidate,
  classifyExisting
};
