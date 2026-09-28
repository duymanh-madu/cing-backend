"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  classifyCommerceReviveEntitlement,
} = require("../cingCommerceReviveEntitlementPolicyV1");

const root = path.resolve(__dirname, "../../../..");

const sup = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260928040000_cing_commerce_revive_entitlement_snapshot_v1.sql"
  ),
  "utf8"
);

const db = fs.readFileSync(
  path.join(
    root,
    "db/migrations/20260928_cing_commerce_revive_entitlement_snapshot_v1.sql"
  ),
  "utf8"
);

const valid = {
  cutoverAt: "2026-09-28T04:00:00Z",
  orderCreatedAt: "2026-09-28T04:01:00Z",
  paymentAuthorityVerified: true,
  paymentOccurredAfterCutoverVerified: true,
  priceSnapshotVerified: true,
  eligibleAmount: 50000,
  spendPerPlay: 20000,
};

test("migration mirrors match", () => {
  assert.equal(sup, db);
});

test("snapshot is captured only on new Commerce order insert", () => {
  assert.match(sup, /after insert\s+on public\.orders/i);
  assert.doesNotMatch(
    sup,
    /insert into public\.cing_revive_credit_transactions/i
  );
});

test("threshold is locked and snapshot cannot be updated", () => {
  assert.match(sup, /for share/i);
  assert.match(sup, /before update or delete/i);
});

test("snapshot has no application write grant", () => {
  assert.match(
    sup,
    /grant select\s+on table public\.cing_commerce_revive_price_snapshots_v1\s+to service_role/i
  );
  assert.doesNotMatch(
    sup,
    /grant (insert|update|delete|all)\s+on table public\.cing_commerce_revive_price_snapshots_v1\s+to service_role/i
  );
});

test("invalid reward config cannot reject a Commerce order", () => {
  assert.match(
    sup,
    /snapshot_status\s+text\s+not null/i
  );
  assert.match(
    sup,
    /when v_price > 0 then 'valid'/i
  );
  assert.match(
    sup,
    /else 'review_required'/i
  );
  assert.match(
    sup,
    /when v_price > 0 then v_price\s+else null/i
  );
  assert.doesNotMatch(
    sup,
    /raise exception\s+'CING_COMMERCE_REVIVE_PRICE_SNAPSHOT_INVALID'/i
  );
});

test("snapshot SQL errors are isolated from Commerce order creation", () => {
  assert.match(
    sup,
    /exception when others then[\s\S]*?CING_COMMERCE_REVIVE_SNAPSHOT_REVIEW_REQUIRED/i
  );

  assert.match(
    sup,
    /exception when others then[\s\S]*?end;[\s\S]*?return new;/i
  );

  assert.match(
    sup,
    /A missing snapshot is NOT permission to[\s\S]*?review_required/i
  );
});

test("verified new Commerce order is classified", () => {
  assert.deepEqual(
    classifyCommerceReviveEntitlement(valid),
    {
      decision: "eligible_for_revive",
      reason: "verified_post_cutover_commerce_entitlement",
      reviveCredits: 2,
    }
  );
});

test("legacy award cannot receive another grant", () => {
  assert.equal(
    classifyCommerceReviveEntitlement({
      ...valid,
      legacyAwardExists: true,
    }).decision,
    "already_awarded_legacy"
  );
});

test("Revive Credit replay cannot grant twice", () => {
  assert.equal(
    classifyCommerceReviveEntitlement({
      ...valid,
      reviveAwardExists: true,
    }).decision,
    "already_awarded_revive"
  );
});

test("pre-cutover order requires reconciliation", () => {
  assert.equal(
    classifyCommerceReviveEntitlement({
      ...valid,
      orderCreatedAt: "2026-09-28T03:59:59Z",
    }).decision,
    "review_required"
  );
});

test("unverified payment cannot qualify", () => {
  assert.equal(
    classifyCommerceReviveEntitlement({
      ...valid,
      paymentOccurredAfterCutoverVerified: false,
    }).decision,
    "review_required"
  );
});

test("missing price snapshot cannot qualify", () => {
  assert.equal(
    classifyCommerceReviveEntitlement({
      ...valid,
      priceSnapshotVerified: false,
    }).decision,
    "review_required"
  );
});

test("below-threshold order receives zero", () => {
  assert.equal(
    classifyCommerceReviveEntitlement({
      ...valid,
      eligibleAmount: 15000,
    }).reviveCredits,
    0
  );
});

test("invalid cutover fails closed", () => {
  assert.throws(
    () =>
      classifyCommerceReviveEntitlement({
        ...valid,
        cutoverAt: null,
      }),
    /CING_COMMERCE_REVIVE_CUTOVER_REQUIRED/
  );
});
