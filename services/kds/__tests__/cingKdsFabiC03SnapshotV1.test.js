"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeC03Snapshot
} = require("../cingKdsFabiC03SnapshotV1");

function line(id, category, quantity, modifiers = []) {
  return {
    id_sale_detail: id,
    item_id: `ITEM-${id}`,
    item_name: `ITEM ${id}`,
    item_class_id: category,
    item_type_id: category,
    quantity,
    note: category === "DU" ? "Ấm" : "",
    deleted: false,
    toppings: modifiers
  };
}

function modifier(id, name, quantity = 1) {
  return {
    id_sale_detail: id,
    item_id: `ITEM-${id}`,
    item_name: name,
    quantity,
    is_eat_with: 1,
    item_class_id: "DU",
    item_type_id: "ITEM_TYPE_OTHER",
    note: "",
    sub_topping: []
  };
}

function bill(tranId = "TX-1") {
  return {
    brand_id: "BRAND-TEST",
    device_code: "POS-TEST",
    tran_id: tranId,
    tran_no: "000001",
    tran_date: 1791000000000,
    start_date: 1790999990000,
    sale_updated_at: 1790999995000,
    deleted: false,
    sale_payment_method: [
      { is_paid: 1, deleted: false }
    ],
    extra_data: {
      customer_name: "PRIVATE TEST CUSTOMER",
      customer_phone: "PRIVATE TEST PHONE",
      customer_address: "PRIVATE TEST ADDRESS"
    },
    sale_detail: [
      line("L-1", "DU", 2, [
        modifier("M-1", "0% ĐƯỜNG", 2),
        modifier("M-2", "0% ĐÁ", 2)
      ]),
      line("L-2", "TP", 2),
      line("L-3", "DA", 1)
    ]
  };
}

test("C03 snapshot counts invoices and item classes", () => {
  const result = normalizeC03Snapshot([bill()]);
  assert.deepEqual(result.totals, {
    invoices: 1,
    lines: 3,
    beverage_units: 2,
    standalone_topping_units: 2,
    food_units: 1
  });
});

test("Nested sugar and ice never become cups", () => {
  const result = normalizeC03Snapshot([bill()]);
  const invoice = result.invoices[0];

  assert.equal(invoice.cups.length, 2);
  assert.equal(invoice.lines[0].modifiers.length, 2);
  assert.equal(invoice.cups[0].modifiers[0].item_name,
    "0% ĐƯỜNG");
});

test("Per-cup work identities are distinct", () => {
  const invoice = normalizeC03Snapshot([bill()])
    .invoices[0];

  assert.deepEqual(
    invoice.cups.map(c => c.unit_key),
    ["L-1:0", "L-1:1"]
  );
});

test("Identical product with different notes remains separate", () => {
  const sample = bill();
  sample.sale_detail.push(
    { ...line("L-4", "DU", 1), note: "Ít đá" }
  );

  const result = normalizeC03Snapshot([sample]);
  assert.equal(result.totals.beverage_units, 3);
  assert.equal(result.invoices[0].lines[3].note, "Ít đá");
});

test("Guest checkout is supported without member identity", () => {
  const sample = bill();
  delete sample.extra_data;

  const result = normalizeC03Snapshot([sample]);

  assert.equal(result.totals.invoices, 1);
});

test("Customer PII is never projected", () => {
  const result = normalizeC03Snapshot([bill()]);
  const serialized = JSON.stringify(result);

  for (const secret of [
    "PRIVATE TEST CUSTOMER",
    "PRIVATE TEST PHONE",
    "PRIVATE TEST ADDRESS"
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("Payment remains unverified despite POS paid flag", () => {
  const result = normalizeC03Snapshot([bill()]);
  const invoice = result.invoices[0];

  assert.equal(invoice.source_reports_paid, true);
  assert.equal(
    invoice.payment_verification,
    "pending_verification"
  );
  assert.equal(result.payment_authority_verified, false);
});

test("Source completeness cannot be certified", () => {
  const sample = bill();
  sample.sourceCompletenessVerified = true;

  const result = normalizeC03Snapshot([sample]);

  assert.equal(
    result.source_completeness_verified,
    false
  );
  assert.equal(
    result.reconciliation_verdict,
    "not_verified"
  );
});

test("Duplicate transaction is rejected", () => {
  assert.throws(
    () => normalizeC03Snapshot([bill(), bill()])
  );
});

test("Duplicate line identity is rejected", () => {
  const sample = bill();
  sample.sale_detail.push(line("L-1", "DU", 1));

  assert.throws(
    () => normalizeC03Snapshot([sample])
  );
});

test("Unknown item classification fails closed", () => {
  const sample = bill();
  sample.sale_detail[0].item_class_id = "UNKNOWN";

  assert.throws(
    () => normalizeC03Snapshot([sample])
  );
});

test("Deleted invoice is not silently materialized", () => {
  const sample = bill();
  sample.deleted = true;

  assert.throws(
    () => normalizeC03Snapshot([sample])
  );
});

test("Deleted line is not silently materialized", () => {
  const sample = bill();
  sample.sale_detail[0].deleted = true;

  assert.throws(
    () => normalizeC03Snapshot([sample])
  );
});

test("Quantity corruption fails closed", () => {
  for (const invalid of [0, -1, 1.5, null, "2"]) {
    const sample = bill();
    sample.sale_detail[0].quantity = invalid;

    assert.throws(
      () => normalizeC03Snapshot([sample])
    );
  }
});

test("Replay creates identical fingerprints", () => {
  const first = normalizeC03Snapshot([bill()]);
  const second = normalizeC03Snapshot([bill()]);

  assert.equal(
    first.invoices[0].fingerprint,
    second.invoices[0].fingerprint
  );
});

test("Changed modifier changes invoice fingerprint", () => {
  const first = normalizeC03Snapshot([bill()]);

  const updated = bill();
  updated.sale_detail[0].toppings[0].item_name =
    "50% ĐƯỜNG";

  const second = normalizeC03Snapshot([updated]);

  assert.notEqual(
    first.invoices[0].fingerprint,
    second.invoices[0].fingerprint
  );
});

test("Distinct transactions stay distinct", () => {
  const result = normalizeC03Snapshot([
    bill("TX-1"),
    bill("TX-2")
  ]);

  assert.equal(result.totals.invoices, 2);
  assert.notEqual(
    result.invoices[0].fingerprint,
    result.invoices[1].fingerprint
  );
});

test("Missing deletion markers remain unverified", () => {
  const sample = bill();

  delete sample.deleted;
  delete sample.sale_detail[0].deleted;

  const result =
    normalizeC03Snapshot([sample]);

  const invoice =
    result.invoices[0];

  assert.equal(
    invoice.deletion_verification,
    "unverified"
  );

  assert.equal(
    invoice.lines[0].deletion_verification,
    "unverified"
  );
});

test("Explicit false deletion markers remain explicit", () => {
  const result =
    normalizeC03Snapshot([bill()]);

  const invoice =
    result.invoices[0];

  assert.equal(
    invoice.deletion_verification,
    "explicit_not_deleted"
  );

  assert.equal(
    invoice.lines[0].deletion_verification,
    "explicit_not_deleted"
  );
});

test("Invalid deletion marker fails closed", () => {
  const sample = bill();

  sample.deleted = "false";

  assert.throws(
    () =>
      normalizeC03Snapshot([sample]),
    error =>
      error.code === "C03_INVALID"
  );
});

test("store_uid provides live C03 source scope", () => {
  const sample = bill();

  delete sample.brand_id;

  sample.store_uid =
    "STORE-LIVE-1";

  const result =
    normalizeC03Snapshot([sample]);

  const invoice =
    result.invoices[0];

  assert.equal(
    invoice.pos_parent,
    "STORE-LIVE-1"
  );

  assert.equal(
    invoice.source_brand_id,
    null
  );

  assert.equal(
    invoice.source_store_uid,
    "STORE-LIVE-1"
  );
});

test("Payment records without paid flags remain unverified",
() => {
  const sample = bill();

  sample.sale_payment_method = [{
    amount: 50000,
    payment_method_id: "CARD",
    payment_method_name: "TEST PAYMENT"
  }];

  const result =
    normalizeC03Snapshot([sample]);

  const invoice =
    result.invoices[0];

  assert.equal(
    invoice.source_reports_paid,
    false
  );

  assert.equal(
    invoice.source_payment_records_present,
    true
  );

  assert.equal(
    invoice.source_payment_record_count,
    1
  );

  assert.equal(
    invoice.payment_verification,
    "pending_verification"
  );

  assert.equal(
    result.payment_authority_verified,
    false
  );
});

test("Empty payment records never become payment authority",
() => {
  const sample = bill();

  sample.sale_payment_method = [];

  const result =
    normalizeC03Snapshot([sample]);

  const invoice =
    result.invoices[0];

  assert.equal(
    invoice.source_reports_paid,
    false
  );

  assert.equal(
    invoice.source_payment_records_present,
    false
  );

  assert.equal(
    invoice.source_payment_record_count,
    0
  );

  assert.equal(
    result.payment_authority_verified,
    false
  );
});

test("Sanitized live C03 shape normalizes", () => {
  const sample = bill("LIVE-TX-1");

  delete sample.brand_id;
  delete sample.deleted;
  delete sample.device_code;

  sample.store_uid =
    "LIVE-STORE";

  sample.sale_detail.forEach(item => {
    delete item.deleted;
  });

  sample.sale_payment_method = [{
    amount: 345708,
    tran_id: "LIVE-TX-1",
    payment_method_id:
      "PAYMENT-METHOD",
    payment_method_name:
      "PAYMENT"
  }];

  const result =
    normalizeC03Snapshot([sample]);

  const invoice =
    result.invoices[0];

  assert.equal(
    invoice.tran_id,
    "LIVE-TX-1"
  );

  assert.equal(
    invoice.pos_parent,
    "LIVE-STORE"
  );

  assert.equal(
    invoice.deletion_verification,
    "unverified"
  );

  assert.equal(
    invoice.lines.every(
      line =>
        line.deletion_verification ===
        "unverified"
    ),
    true
  );

  assert.equal(
    invoice.source_payment_records_present,
    true
  );

  assert.equal(
    invoice.payment_verification,
    "pending_verification"
  );

  assert.equal(
    result.source_completeness_verified,
    false
  );

  assert.equal(
    result.payment_authority_verified,
    false
  );
});
