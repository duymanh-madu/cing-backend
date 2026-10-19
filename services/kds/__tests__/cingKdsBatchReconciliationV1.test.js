const test = require("node:test");
const assert = require("node:assert/strict");

const {
  reconcileKdsBatch
} = require("../cingKdsBatchReconciliationV1");

function source(n, milk = 2, peach = 1) {
  return {
    event: "sale_manager",
    event_id: 11,
    sale_manager: {
      pos_parent: "LOCAL-ONLY",
      pos_id: 101,
      tran_id: `TX-${n}`,
      items: [
        { item_id: "MILK", item_name: "Trà sữa", quantity: milk },
        { item_id: "PEACH", item_name: "Trà đào", quantity: peach }
      ]
    }
  };
}

function order(event) {
  const sale = event.sale_manager;

  const cups = sale.items.flatMap((item, line) =>
    Array.from({ length: item.quantity }, (_, unit) => ({
      unit_key: `${line}:${unit}`,
      item_id: item.item_id,
      item_name: item.item_name,
      status: "pending"
    }))
  );

  return {
    pos_parent: sale.pos_parent,
    pos_id: sale.pos_id,
    tran_id: sale.tran_id,
    cups
  };
}

function audit(sources, orders, complete = true) {
  return reconcileKdsBatch({
    sourceInvoices: sources,
    kdsOrders: orders,
    sourceCompletenessVerified: complete
  });
}

test("Exact invoices and exact items pass with complete source", () => {
  const a = source(1);
  const b = source(2, 3, 2);
  const r = audit([a, b], [order(a), order(b)]);

  assert.equal(r.verdict, "not_verified");
  assert.equal(r.structural_verdict, "pass");
  assert.equal(r.source_completeness_verified, false);
  assert.equal(r.matched_orders, 2);
  assert.equal(r.expected_cups, 8);
  assert.equal(r.actual_cups, 8);
});

test("Incomplete source cannot claim pass", () => {
  const a = source(1);
  const r = audit([a], [order(a)], false);

  assert.equal(r.structural_verdict, "pass");
  assert.equal(r.verdict, "not_verified");
});

test("Missing invoice detected", () => {
  const a = source(1), b = source(2);
  const r = audit([a, b], [order(a)]);

  assert.equal(r.verdict, "fail");
  assert.equal(r.missing_orders.length, 1);
});

test("Extra invoice detected", () => {
  const a = source(1), b = source(2);
  const r = audit([a], [order(a), order(b)]);

  assert.equal(r.verdict, "fail");
  assert.equal(r.extra_orders.length, 1);
});

test("Same cup total but wrong item distribution fails", () => {
  const a = source(1, 2, 1);
  const wrong = order(source(1, 1, 2));
  const r = audit([a], [wrong]);

  assert.equal(r.expected_cups, 3);
  assert.equal(r.actual_cups, 3);
  assert.equal(r.verdict, "fail");
  assert.equal(r.mismatched_orders.length, 1);
});

test("Wrong branch fails", () => {
  const a = source(1);
  const b = order(a);
  b.pos_id = 999;

  assert.equal(audit([a], [b]).verdict, "fail");
});

test("Duplicate KDS invoice fails", () => {
  const a = source(1);
  const r = audit([a], [order(a), order(a)]);

  assert.equal(r.verdict, "fail");
  assert.equal(r.duplicate_order_keys.length, 1);
});

test("Duplicate source invoice fails closed", () => {
  const a = source(1);
  const r = audit([a, a], [order(a)]);

  assert.equal(r.verdict, "fail");
  assert.equal(r.duplicate_source_keys.length, 1);
});

test("Missing individual cup fails", () => {
  const a = source(1);
  const b = order(a);
  b.cups.pop();

  assert.equal(audit([a], [b]).verdict, "fail");
});

test("Extra individual cup fails", () => {
  const a = source(1);
  const b = order(a);

  b.cups.push({
    unit_key: "9:0",
    item_id: "EXTRA",
    item_name: "Món thừa",
    status: "pending"
  });

  assert.equal(audit([a], [b]).verdict, "fail");
});

test("Invalid quantity in source fails", () => {
  const a = source(1);
  a.sale_manager.items[0].quantity = 0;

  const r = audit([a], []);

  assert.equal(r.verdict, "fail");
  assert.deepEqual(r.invalid_source_indices, [0]);
});

test("Empty source and KDS cannot falsely pass", () => {
  assert.equal(audit([], []).verdict, "fail");
});

test("Invalid KDS order fails", () => {
  const a = source(1);
  const r = audit([a], [null]);

  assert.equal(r.verdict, "fail");
  assert.deepEqual(r.invalid_order_indices, [0]);
});

test("Missing input is rejected", () => {
  assert.throws(
    () => reconcileKdsBatch(),
    /KDS_RECONCILIATION_INPUT_REQUIRED/
  );
});

test("Modifier and payment authority are not implied", () => {
  const a = source(1);
  const r = audit([a], [order(a)]);

  assert.equal(r.modifiers_verified, false);
  assert.equal(r.payment_authority_verified, false);
});

test("Caller cannot self-certify source completeness", () => {
  const a = source(1);
  const b = order(a);

  for (const claimed of [true, false]) {
    const result = reconcileKdsBatch({
      sourceInvoices: [a],
      kdsOrders: [b],
      sourceCompletenessVerified: claimed
    });

    assert.equal(result.structural_verdict, "pass");
    assert.equal(result.verdict, "not_verified");
    assert.equal(result.source_completeness_verified, false);
  }
});
