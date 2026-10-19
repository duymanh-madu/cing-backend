"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareC03Snapshots
} = require("../cingKdsFabiC03DeltaV1");

function line(id, quantity = 1) {
  return {
    id_sale_detail: id,
    item_id: `ITEM-${id}`,
    item_name: "TEST BEVERAGE",
    item_class_id: "DU",
    item_type_id: "TEST",
    quantity,
    note: "",
    toppings: [],
    deleted: false
  };
}

function invoice(id = "TX-1") {
  return {
    brand_id: "BRAND-TEST",
    tran_id: id,
    tran_no: id,
    deleted: false,
    sale_payment_method: [
      { is_paid: 1, deleted: false }
    ],
    sale_detail: [line("LINE-1")]
  };
}

function compare(a, b) {
  return compareC03Snapshots(a, b);
}

test("Identical snapshot has no changes", () => {
  assert.equal(
    compare([invoice()], [invoice()]).change_count,
    0
  );
});

test("First observed invoice is not auto-created", () => {
  const result = compare([], [invoice()]);

  assert.equal(result.changes[0].type,
    "invoice_first_observed");
  assert.equal(result.automatic_mutation_allowed, false);
});

test("Missing invoice is not treated as cancellation", () => {
  const result = compare([invoice()], []);

  assert.equal(result.changes[0].type,
    "invoice_missing_review");
});

test("Added line is detected", () => {
  const updated = invoice();
  updated.sale_detail.push(line("LINE-2"));

  const result = compare([invoice()], [updated]);

  assert.equal(result.changes[0].type,
    "line_first_observed");
});

test("Missing line cannot be silently deleted", () => {
  const previous = invoice();
  previous.sale_detail.push(line("LINE-2"));

  const result = compare([previous], [invoice()]);

  assert.equal(result.changes[0].type,
    "line_missing_review");
});

test("Quantity change is review-required", () => {
  const updated = invoice();
  updated.sale_detail[0].quantity = 2;

  const result = compare([invoice()], [updated]);

  assert.equal(result.changes[0].type,
    "line_changed_review");
});

test("Modifier change is detected", () => {
  const previous = invoice();
  const updated = invoice();

  const topping = {
    id_sale_detail: "TOP-1",
    item_id: "SUGAR",
    item_name: "30% ĐƯỜNG",
    quantity: 1,
    note: "",
    is_eat_with: 1,
    sub_topping: []
  };

  previous.sale_detail[0].toppings = [topping];

  updated.sale_detail[0].toppings = [{
    ...topping,
    item_name: "70% ĐƯỜNG"
  }];

  const result = compare([previous], [updated]);

  assert.equal(result.changes[0].type,
    "line_changed_review");
});

test("Invoice metadata change cannot silently pass", () => {
  const previous = invoice();
  const updated = invoice();

  previous.sale_updated_at = 1000;
  updated.sale_updated_at = 2000;

  const result = compare([previous], [updated]);

  assert.equal(result.changes[0].type,
    "invoice_metadata_changed_review");
});

test("Caller cannot authorize completeness", () => {
  const current = invoice();
  current.sourceCompletenessVerified = true;

  const result = compare([], [current]);

  assert.equal(result.source_completeness_verified,
    false);
  assert.equal(result.verdict, "not_verified");
});

test("Duplicate invoice snapshot fails closed", () => {
  assert.throws(() =>
    compare([invoice(), invoice()], [])
  );
});

test("Deleted invoice fails closed", () => {
  const updated = invoice();
  updated.deleted = true;

  assert.throws(() => compare([], [updated]));
});

test("No customer information is projected", () => {
  const current = invoice();
  current.extra_data = {
    customer_name: "PRIVATE_CUSTOMER",
    customer_phone: "PRIVATE_PHONE"
  };

  const result = compare([], [current]);

  assert.equal(
    JSON.stringify(result).includes("PRIVATE_"),
    false
  );
});
