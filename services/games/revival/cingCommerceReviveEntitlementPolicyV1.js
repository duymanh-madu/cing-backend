"use strict";

/*
 * CING GAME CENTER V2
 * COMMERCE REVIVE ENTITLEMENT POLICY V1
 *
 * Pure classification. No DB, money, balance or ledger access.
 * All inputs must be supplied by a trusted backend authority.
 *
 * A future transactional RPC must independently validate
 * canonical payment, order, snapshot and ledger evidence.
 */

function instant(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }

  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function review(reason) {
  return {
    decision: "review_required",
    reason,
    reviveCredits: null,
  };
}

function classifyCommerceReviveEntitlement({
  cutoverAt,
  orderCreatedAt,
  paymentAuthorityVerified = false,
  paymentOccurredAfterCutoverVerified = false,
  priceSnapshotVerified = false,
  legacyAwardExists = false,
  reviveAwardExists = false,
  eligibleAmount,
  spendPerPlay,
} = {}) {
  const boundary = instant(cutoverAt);

  if (boundary === null) {
    throw new Error("CING_COMMERCE_REVIVE_CUTOVER_REQUIRED");
  }

  if (legacyAwardExists === true) {
    return {
      decision: "already_awarded_legacy",
      reason: "durable_legacy_award_exists",
      reviveCredits: 0,
    };
  }

  if (reviveAwardExists === true) {
    return {
      decision: "already_awarded_revive",
      reason: "durable_revive_award_exists",
      reviveCredits: 0,
    };
  }

  const created = instant(orderCreatedAt);

  if (created === null) {
    return review("commerce_order_creation_time_missing");
  }

  /*
   * An order created before cutover may have paid later.
   * Do not infer its entitlement class from insertion time.
   */
  if (created < boundary) {
    return review("pre_cutover_commerce_order_requires_reconciliation");
  }

  if (
    paymentAuthorityVerified !== true ||
    paymentOccurredAfterCutoverVerified !== true
  ) {
    return review("verified_post_cutover_payment_evidence_missing");
  }

  if (priceSnapshotVerified !== true) {
    return review("commerce_price_snapshot_unverified");
  }

  if (
    !Number.isSafeInteger(eligibleAmount) ||
    eligibleAmount < 0 ||
    !Number.isSafeInteger(spendPerPlay) ||
    spendPerPlay <= 0
  ) {
    return review("commerce_reward_inputs_invalid");
  }

  const credits = Math.floor(eligibleAmount / spendPerPlay);

  if (
    !Number.isSafeInteger(credits) ||
    credits > 2147483647
  ) {
    return review("commerce_revive_reward_overflow");
  }

  if (credits === 0) {
    return {
      decision: "below_threshold",
      reason: "commerce_spend_threshold_not_reached",
      reviveCredits: 0,
    };
  }

  return {
    decision: "eligible_for_revive",
    reason: "verified_post_cutover_commerce_entitlement",
    reviveCredits: credits,
  };
}

module.exports = {
  classifyCommerceReviveEntitlement,
};
