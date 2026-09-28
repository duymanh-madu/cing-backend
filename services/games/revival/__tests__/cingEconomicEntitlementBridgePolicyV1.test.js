"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyEconomicEntitlement: classify,
} = require(
  "../cingEconomicEntitlementBridgePolicyV1"
);

const base = {
  cutoverAt: "2026-09-28T10:00:00+07:00",
  verifiedEconomicAt: "2026-09-28T10:00:00+07:00",
  economicTimeVerified: true,
  paymentAuthorityVerified: true,
  canonicalIdentityVerified: true,
  priceSnapshotVerified: true,
  legacyAwardExists: false,
  reviveAwardExists: false,
  eligibleAmount: 60000,
  spendPerPlay: 20000,
};

test("verified cutover boundary grants revive classification", () => {
  const result = classify(base);
  assert.equal(result.decision, "eligible_for_revive");
  assert.equal(result.reviveCredits, 3);
});

test("pre-cutover entitlement is never granted automatically", () => {
  const result = classify({
    ...base,
    verifiedEconomicAt: "2026-09-28T09:59:59+07:00",
  });
  assert.equal(
    result.decision,
    "legacy_reconciliation_required"
  );
  assert.equal(result.reviveCredits, null);
});

test("missing canonical source equivalence requires review", () => {
  const result = classify({
    ...base,
    canonicalIdentityVerified: false,
  });
  assert.equal(result.decision, "review_required");
});

test("intent creation cannot substitute for payment proof", () => {
  const result = classify({
    ...base,
    economicTimeVerified: false,
  });
  assert.equal(result.decision, "review_required");
});

test("invalid original economic time requires review", () => {
  const result = classify({
    ...base,
    verifiedEconomicAt: "2026-09-28 10:00:00",
  });
  assert.equal(result.decision, "review_required");
});

test("no later Admin price can substitute for snapshot", () => {
  const result = classify({
    ...base,
    priceSnapshotVerified: false,
  });
  assert.equal(result.decision, "review_required");
});

test("legacy award excludes another revive award", () => {
  const result = classify({
    ...base,
    legacyAwardExists: true,
  });
  assert.equal(
    result.decision,
    "already_awarded_legacy"
  );
  assert.equal(result.reviveCredits, 0);
});

test("revive replay is not an additional grant", () => {
  const result = classify({
    ...base,
    reviveAwardExists: true,
  });
  assert.equal(
    result.decision,
    "already_awarded_revive"
  );
  assert.equal(result.reviveCredits, 0);
});

test("conflicting award ledgers require review", () => {
  const result = classify({
    ...base,
    legacyAwardExists: true,
    reviveAwardExists: true,
  });
  assert.equal(result.decision, "review_required");
});

test("amount below original threshold grants zero", () => {
  const result = classify({
    ...base,
    eligibleAmount: 19999,
  });
  assert.equal(result.decision, "below_threshold");
  assert.equal(result.reviveCredits, 0);
});

test("invalid reward inputs fail closed", () => {
  for (const value of [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const result = classify({
      ...base,
      eligibleAmount: value,
    });
    assert.equal(result.decision, "review_required");
  }
});

test("missing cutover is a hard error", () => {
  assert.throws(
    () => classify({
      ...base,
      cutoverAt: null,
    }),
    /CING_BRIDGE_CUTOVER_INSTANT_REQUIRED/
  );
});
