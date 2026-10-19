"use strict";

const {
  buildIngestionCandidate
} = require("./cingKdsEvent11IngestionV1");

/*
 * KDS durable-first ingestion coordinator.
 *
 * No Express registration.
 * No direct HTTP, Supabase, Redis or iPOS access.
 *
 * verifySource must be supplied by a future audited
 * ingress authentication authority. No implicit trust.
 *
 * persist must commit through durable PostgreSQL
 * ingestion authority before resolving.
 *
 * Successful ACK means the event/conflict was durably
 * accepted, NOT payment verified or KDS-ready.
 */

function makeKdsDurableIngress({
  verifySource,
  persist
} = {}) {
  if (
    typeof verifySource !== "function" ||
    typeof persist !== "function"
  ) {
    throw new Error("KDS_INGRESS_DEPENDENCIES_REQUIRED");
  }

  return async function receive({
    body,
    headers
  } = {}) {
    let authorized;

    try {
      authorized = await verifySource({ body, headers });
    } catch {
      return {
        status: 503,
        body: {
          success: false,
          code: "KDS_SOURCE_VERIFICATION_UNAVAILABLE"
        }
      };
    }

    if (authorized !== true) {
      return {
        status: 401,
        body: {
          success: false,
          code: "KDS_SOURCE_NOT_VERIFIED"
        }
      };
    }

    let candidate;

    try {
      candidate = buildIngestionCandidate(body);
    } catch {
      return {
        status: 422,
        body: {
          success: false,
          code: "KDS_EVENT11_INVALID"
        }
      };
    }

    let receipt;

    try {
      receipt = await persist(candidate);
    } catch {
      return {
        status: 503,
        body: {
          success: false,
          code: "KDS_DURABLE_PERSIST_FAILED"
        }
      };
    }

    if (
      !receipt ||
      ![
        "inserted",
        "duplicate",
        "review_required"
      ].includes(receipt.outcome) ||
      typeof receipt.inbox_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(receipt.inbox_id)
    ) {
      return {
        status: 503,
        body: {
          success: false,
          code: "KDS_DURABLE_RECEIPT_INVALID"
        }
      };
    }

    return {
      status: 200,
      body: { success: true },
      internal: {
        outcome: receipt.outcome,
        inbox_id: receipt.inbox_id,
        payment_verification: "pending_verification"
      }
    };
  };
}

module.exports = { makeKdsDurableIngress };
