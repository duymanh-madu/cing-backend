"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyLegacyOrderEntitlement,
} = require(
  "../cingLegacyOrderEntitlementPolicyV1"
);

const CUTOVER =
  "2026-09-27T01:00:00+07:00";

/*
 * Test-only example cutover timestamp.
 * NOT a proposed production cutover time.
 */

function classify(overrides = {}) {
  return classifyLegacyOrderEntitlement({
    cutoverAt: CUTOVER,
    entitlementAt:
      "2026-09-27T00:59:59+07:00",
    entitlementTimeSource:
      "commerce_paid_at",
    evidenceVerified: true,
    historicalSpendPerPlay: 20000,
    eligibleOrderAmount: 60000,
    ...overrides,
  });
}

test(
  "verified pre-cutover entitlement is eligible",
  () => {
    const result = classify();

    assert.equal(
      result.decision,
      "eligible_for_reconciliation"
    );

    assert.equal(
      result.plays,
      3
    );
  }
);

test(
  "existing durable award cannot be awarded again",
  () => {
    const result = classify({
      alreadyAwarded: true,
    });

    assert.equal(
      result.decision,
      "already_awarded"
    );

    assert.equal(
      result.plays,
      0
    );
  }
);

test(
  "missing entitlement time requires review",
  () => {
    const result = classify({
      entitlementAt: null,
    });

    assert.equal(
      result.decision,
      "review_required"
    );

    assert.equal(
      result.reason,
      "entitlement_instant_missing"
    );
  }
);

test(
  "CRM insertion time is not sufficient evidence",
  () => {
    const result = classify({
      entitlementTimeSource:
        "crm_orders_created_at",
    });

    assert.equal(
      result.decision,
      "review_required"
    );
  }
);

test(
  "webhook arrival time is not sufficient evidence",
  () => {
    const result = classify({
      entitlementTimeSource:
        "webhook_received_at",
    });

    assert.equal(
      result.decision,
      "review_required"
    );
  }
);

test(
  "unverified timestamp requires review",
  () => {
    const result = classify({
      evidenceVerified: false,
    });

    assert.equal(
      result.decision,
      "review_required"
    );
  }
);

test(
  "missing historical threshold requires review",
  () => {
    const result = classify({
      historicalSpendPerPlay: null,
    });

    assert.equal(
      result.decision,
      "review_required"
    );

    assert.equal(
      result.plays,
      null
    );
  }
);

test(
  "current price cannot silently replace history",
  () => {
    const result = classify({
      historicalSpendPerPlay: 0,
    });

    assert.equal(
      result.decision,
      "review_required"
    );
  }
);

test(
  "entitlement at cutover belongs to V2",
  () => {
    const result = classify({
      entitlementAt: CUTOVER,
    });

    assert.equal(
      result.decision,
      "post_cutover"
    );
  }
);

test(
  "entitlement after cutover belongs to V2",
  () => {
    const result = classify({
      entitlementAt:
        "2026-09-27T01:00:01+07:00",
    });

    assert.equal(
      result.decision,
      "post_cutover"
    );
  }
);

test(
  "verified amount below threshold awards nothing",
  () => {
    const result = classify({
      eligibleOrderAmount: 19999,
    });

    assert.equal(
      result.decision,
      "below_threshold"
    );

    assert.equal(
      result.plays,
      0
    );
  }
);

test(
  "missing verified amount requires review",
  () => {
    const result = classify({
      eligibleOrderAmount: null,
    });

    assert.equal(
      result.decision,
      "review_required"
    );
  }
);

test(
  "iPOS original payment evidence is accepted",
  () => {
    const result = classify({
      entitlementTimeSource:
        "ipos_original_paid_at",
    });

    assert.equal(
      result.decision,
      "eligible_for_reconciliation"
    );
  }
);

test(
  "verified legacy snapshot is accepted",
  () => {
    const result = classify({
      entitlementTimeSource:
        "legacy_entitlement_snapshot",
    });

    assert.equal(
      result.decision,
      "eligible_for_reconciliation"
    );
  }
);

test(
  "invalid cutover timestamp fails closed",
  () => {
    assert.throws(
      () => classify({
        cutoverAt: "invalid",
      }),
      /CING_LEGACY_CUTOVER_INSTANT_REQUIRED/
    );
  }
);

test(
  "large award does not overflow int4",
  () => {
    const result = classify({
      historicalSpendPerPlay: 1,
      eligibleOrderAmount: 2147483648,
    });

    assert.equal(
      result.decision,
      "review_required"
    );

    assert.equal(
      result.reason,
      "legacy_award_quantity_out_of_range"
    );
  }
);

test(
  "policy has no financial or database access",
  () => {
    const fs = require("node:fs");
    const path = require("node:path");

    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../cingLegacyOrderEntitlementPolicyV1.js"
      ),
      "utf8"
    );

    for (const forbidden of [
      'require("../../supabase")',
      ".rpc(",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      "fetch(",
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        forbidden
      );
    }
  }
);
