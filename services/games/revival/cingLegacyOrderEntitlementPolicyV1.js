"use strict";

/*
 * CING GAME CENTER V2
 * LEGACY ORDER ENTITLEMENT POLICY V1
 *
 * Pure classification only.
 *
 * No database access.
 * No Wallet access.
 * No loyalty-point mutation.
 * No legacy play mutation.
 * No Revive Credit mutation.
 *
 * Inputs must eventually come from backend/database
 * authorities, never directly from customer payloads.
 */

const VERIFIED_TIME_SOURCES =
  new Set([
    "commerce_paid_at",
    "ipos_original_paid_at",
    "legacy_entitlement_snapshot",
  ]);

function review(reason) {
  return {
    decision: "review_required",
    reason,
    plays: null,
  };
}

function parseInstant(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  ) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function positiveSafeInteger(value) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function classifyLegacyOrderEntitlement({
  cutoverAt,
  alreadyAwarded = false,
  entitlementAt = null,
  entitlementTimeSource = null,
  evidenceVerified = false,
  historicalSpendPerPlay = null,
  eligibleOrderAmount = null,
} = {}) {
  const cutoverTime =
    parseInstant(cutoverAt);

  if (cutoverTime === null) {
    throw new Error(
      "CING_LEGACY_CUTOVER_INSTANT_REQUIRED"
    );
  }

  /*
   * An already-awarded transaction must never become
   * another entitlement merely because a worker
   * processes its source again.
   *
   * The caller must prove this from a durable award
   * ledger, not from an untrusted request parameter.
   */
  if (alreadyAwarded === true) {
    return {
      decision: "already_awarded",
      reason: "durable_award_exists",
      plays: 0,
    };
  }

  if (
    evidenceVerified !== true ||
    !VERIFIED_TIME_SOURCES.has(
      entitlementTimeSource
    )
  ) {
    return review(
      "authoritative_entitlement_evidence_missing"
    );
  }

  const entitlementTime =
    parseInstant(entitlementAt);

  if (entitlementTime === null) {
    return review(
      "entitlement_instant_missing"
    );
  }

  /*
   * The cutover boundary is half-open:
   *
   * V1: entitlementAt < cutoverAt
   * V2: entitlementAt >= cutoverAt
   */
  if (entitlementTime >= cutoverTime) {
    return {
      decision: "post_cutover",
      reason: "entitlement_not_before_cutover",
      plays: 0,
    };
  }

  /*
   * Do not substitute the current Admin price or
   * an assumed 20,000 VND historical threshold.
   */
  if (
    !positiveSafeInteger(
      historicalSpendPerPlay
    )
  ) {
    return review(
      "historical_spend_threshold_missing"
    );
  }

  if (
    typeof eligibleOrderAmount !== "number" ||
    !Number.isSafeInteger(
      eligibleOrderAmount
    ) ||
    eligibleOrderAmount < 0
  ) {
    return review(
      "verified_order_amount_missing"
    );
  }

  const plays = Math.floor(
    eligibleOrderAmount /
    historicalSpendPerPlay
  );

  if (
    !Number.isSafeInteger(plays) ||
    plays > 2147483647
  ) {
    return review(
      "legacy_award_quantity_out_of_range"
    );
  }

  if (plays === 0) {
    return {
      decision: "below_threshold",
      reason: "historical_threshold_not_reached",
      plays: 0,
    };
  }

  return {
    decision:
      "eligible_for_reconciliation",
    reason:
      "verified_pre_cutover_entitlement",
    plays,
  };
}

module.exports = {
  classifyLegacyOrderEntitlement,
};
