"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOperationalProjection,
  compareProjections
} = require("../cingKdsOperationalProjectionV1");

function sample() {
  return {
    event_id: 11,
    event: "sale_manager",
    timestamp: "1790955786871",
    sale_manager: {
      id: "EVENT-001",
      pos_parent: "CING",
      pos_id: 101,
      tran_id: "TRAN-001",
      tran_date: "2026-10-02 20:00:00",
      created_at: "2026-10-02 20:01:00",
      total_amount: 40000,
      items: [{
        item_id: "TC01",
        item_name: "Trân châu đường đen",
        quantity: 2
      }],
      payment_info: [{
        method_id: "CASH",
        amount: 40000
      }]
    }
  };
}

test("Non-CRM order creates two pending cup projections", () => {
  const p = buildOperationalProjection(sample());

  assert.equal(p.cup_count, 2);
  assert.deepEqual(
    p.cups.map(c => c.unit_key),
    ["0:0", "0:1"]
  );
  assert.ok(p.cups.every(c => c.status === "pending"));
});

test("No projection can self-verify payment", () => {
  const p = buildOperationalProjection(sample());

  assert.equal(
    p.payment_verification,
    "pending_verification"
  );
  assert.equal(p.eligible_for_kds, false);
});

test("CRM data never changes fingerprints", () => {
  const a = sample();
  const b = sample();

  b.sale_manager.membership_id = "PRIVATE_PHONE";
  b.sale_manager.membership_name = "PRIVATE_NAME";

  const x = buildOperationalProjection(a);
  const y = buildOperationalProjection(b);

  assert.equal(
    compareProjections(x, y).outcome,
    "duplicate"
  );
});

test("Payment change is not silently classified duplicate", () => {
  const a = sample();
  const b = sample();

  b.sale_manager.payment_info = [
    { method_id: "BANK", amount: 40000 }
  ];

  const x = buildOperationalProjection(a);
  const y = buildOperationalProjection(b);

  const comparison = compareProjections(x, y);

  assert.equal(comparison.operational_changed, false);
  assert.equal(comparison.payment_evidence_changed, true);
  assert.equal(comparison.outcome, "review_required");
});

test("Changed cup quantity requires review", () => {
  const a = sample();
  const b = sample();

  b.sale_manager.items[0].quantity = 3;

  const comparison = compareProjections(
    buildOperationalProjection(a),
    buildOperationalProjection(b)
  );

  assert.equal(comparison.operational_changed, true);
  assert.equal(comparison.outcome, "review_required");
});

test("Raw POS date is preserved without timezone assumptions", () => {
  const p = buildOperationalProjection(sample());

  assert.equal(
    p.tran_date_raw,
    "2026-10-02 20:00:00"
  );
});

test("No private member or payment trace is projected", () => {
  const body = sample();

  body.sale_manager.membership_id = "PRIVATE_MEMBER";
  body.sale_manager.payment_info[0].trace_no =
    "PRIVATE_TRACE";

  const output = JSON.stringify(
    buildOperationalProjection(body)
  );

  assert.ok(!output.includes("PRIVATE_MEMBER"));
  assert.ok(!output.includes("PRIVATE_TRACE"));
});

test("Different transaction identities cannot be merged", () => {
  const a = sample();
  const b = sample();

  b.sale_manager.tran_id = "OTHER-TRAN";

  assert.throws(
    () => compareProjections(
      buildOperationalProjection(a),
      buildOperationalProjection(b)
    ),
    /KDS_PROJECTION_IDENTITY_MISMATCH/
  );
});
