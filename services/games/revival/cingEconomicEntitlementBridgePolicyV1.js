"use strict";

/*
 * CING GAME CENTER V2 — ECONOMIC ENTITLEMENT BRIDGE POLICY
 *
 * Pure classification only.
 *
 * This module never reads database state or mutates a balance.
 * Its boolean evidence inputs MUST be established independently
 * by a future PostgreSQL authority from canonical locked records.
 *
 * In particular:
 * - source equivalence is never inferred from phone/amount/code;
 * - payment intent time is not payment completion time;
 * - order insertion time is not payment completion time;
 * - callback processing time alone is not original payment time;
 * - historical awards must not be recalculated at current price;
 * - REVIEW is not a successful entitlement delivery.
 */

function parseInstant(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decision(name, reason, reviveCredits = null) {
  return {
    decision: name,
    reason,
    reviveCredits,
  };
}

function classifyEconomicEntitlement({
  cutoverAt,
  verifiedEconomicAt = null,
  economicTimeVerified = false,
  paymentAuthorityVerified = false,
  canonicalIdentityVerified = false,
  priceSnapshotVerified = false,
  legacyAwardExists = false,
  reviveAwardExists = false,
  eligibleAmount = null,
  spendPerPlay = null,
} = {}) {
  const cutover = parseInstant(cutoverAt);

  if (cutover === null) {
    throw new Error(
      "CING_BRIDGE_CUTOVER_INSTANT_REQUIRED"
    );
  }

  /*
   * Check conflicting ledger evidence before permitting
   * even a benign "already awarded" interpretation.
   */
  if (legacyAwardExists && reviveAwardExists) {
    return decision(
      "review_required",
      "conflicting_legacy_and_revive_awards"
    );
  }

  if (legacyAwardExists) {
    return decision(
      "already_awarded_legacy",
      "durable_legacy_award_exists",
      0
    );
  }

  if (reviveAwardExists) {
    return decision(
      "already_awarded_revive",
      "durable_revive_award_exists",
      0
    );
  }

  if (canonicalIdentityVerified !== true) {
    return decision(
      "review_required",
      "canonical_economic_identity_unverified"
    );
  }

  if (paymentAuthorityVerified !== true) {
    return decision(
      "review_required",
      "payment_authority_unverified"
    );
  }

  if (economicTimeVerified !== true) {
    return decision(
      "review_required",
      "original_economic_time_unverified"
    );
  }

  const economicAt = parseInstant(
    verifiedEconomicAt
  );

  if (economicAt === null) {
    return decision(
      "review_required",
      "verified_economic_instant_missing"
    );
  }

  /*
   * Never award legacy rights here.
   * A verified pre-cutover economic entitlement is
   * routed to the separate legacy reconciliation path.
   */
  if (economicAt < cutover) {
    return decision(
      "legacy_reconciliation_required",
      "verified_pre_cutover_entitlement"
    );
  }

  if (priceSnapshotVerified !== true) {
    return decision(
      "review_required",
      "original_reward_price_unverified"
    );
  }

  if (
    typeof eligibleAmount !== "number" ||
    !Number.isSafeInteger(eligibleAmount) ||
    eligibleAmount < 0 ||
    typeof spendPerPlay !== "number" ||
    !Number.isSafeInteger(spendPerPlay) ||
    spendPerPlay <= 0
  ) {
    return decision(
      "review_required",
      "reward_snapshot_inputs_invalid"
    );
  }

  const credits = Math.floor(
    eligibleAmount / spendPerPlay
  );

  if (
    !Number.isSafeInteger(credits) ||
    credits > 2147483647
  ) {
    return decision(
      "review_required",
      "revive_reward_quantity_out_of_range"
    );
  }

  if (credits === 0) {
    return decision(
      "below_threshold",
      "original_reward_threshold_not_reached",
      0
    );
  }

  return decision(
    "eligible_for_revive",
    "verified_post_cutover_entitlement",
    credits
  );
}

module.exports = {
  classifyEconomicEntitlement,
};
