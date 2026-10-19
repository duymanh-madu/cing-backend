"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluatePaymentEvidence
} = require("../cingKdsPaymentEvidenceV1");

function sample() {
  return {
    event_id: 11,
    event: "sale_manager",
    timestamp: "1790955786871",
    sale_manager: {
      id: "event-1",
      pos_parent: "CING",
      pos_id: 101,
      tran_id: "TRAN-01",
      total_amount: 36000,
      items: [{
        item_id: "TC01",
        item_name: "Trân châu đường đen",
        quantity: 2
      }],
      payment_info: [{
        method_id: "CASH",
        amount: 36000
      }]
    }
  };
}

test("Non-CRM payment evidence accepted", () => {
  const result = evaluatePaymentEvidence(sample());

  assert.equal(
    result.evidence_status,
    "structurally_consistent"
  );
});

test("CRM does not affect payment evidence", () => {
  const body = sample();

  body.sale_manager.membership_id = "TEST";

  const result = evaluatePaymentEvidence(body);

  assert.equal(
    result.evidence_status,
    "structurally_consistent"
  );
});

test("Evidence never verifies payment", () => {
  const result = evaluatePaymentEvidence(sample());

  assert.equal(
    result.payment_verification,
    "pending_verification"
  );
});

test("Missing payment information requires review", () => {
  const body = sample();
  delete body.sale_manager.payment_info;

  assert.equal(
    evaluatePaymentEvidence(body).evidence_status,
    "review_required"
  );
});

test("Payment mismatch requires review", () => {
  const body = sample();
  body.sale_manager.payment_info[0].amount = 30000;

  assert.ok(
    evaluatePaymentEvidence(body).reasons.includes(
      "PAYMENT_AMOUNT_MISMATCH"
    )
  );
});

test("Multiple payment methods are supported", () => {
  const body = sample();

  body.sale_manager.payment_info = [
    { method_id: "CASH", amount: 10000 },
    { method_id: "BANK", amount: 26000 }
  ];

  assert.equal(
    evaluatePaymentEvidence(body).evidence_status,
    "structurally_consistent"
  );
});

test("Zero-value orders require review", () => {
  const body = sample();

  body.sale_manager.total_amount = 0;
  body.sale_manager.payment_info[0].amount = 0;

  assert.ok(
    evaluatePaymentEvidence(body).reasons.includes(
      "ZERO_AMOUNT_REQUIRES_REVIEW"
    )
  );
});

test("Negative amounts are rejected", () => {
  const body = sample();

  body.sale_manager.payment_info[0].amount = -1;

  assert.ok(
    evaluatePaymentEvidence(body).reasons.includes(
      "PAYMENT_INFO_INVALID"
    )
  );
});

test("Invalid quantity cannot pass validation", () => {
  const body = sample();

  body.sale_manager.items[0].quantity = 0;

  assert.throws(
    () => evaluatePaymentEvidence(body),
    /KDS_INVALID_ITEM_QUANTITY/
  );
});

test("Sensitive payment data is not projected", () => {
  const body = sample();

  body.sale_manager.membership_id =
    "PRIVATE_MEMBER";

  body.sale_manager.payment_info[0].trace_no =
    "PRIVATE_TRACE";

  const result = JSON.stringify(
    evaluatePaymentEvidence(body)
  );

  assert.ok(!result.includes("PRIVATE_MEMBER"));
  assert.ok(!result.includes("PRIVATE_TRACE"));
});

test("Invalid money cannot become zero", () => {
  const body = sample();

  body.sale_manager.total_amount = null;

  assert.ok(
    evaluatePaymentEvidence(body).reasons.includes(
      "INVALID_TOTAL_AMOUNT"
    )
  );
});
