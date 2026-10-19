"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOperationsReadModel
} = require("../cingKdsOperationsReadModelV1");

const NOW = "2026-10-02T14:30:00Z";

function order({
  id = "O1",
  pos = 101,
  started = "2026-10-02T14:10:00Z",
  payment = "verified",
  status = "processed",
  conflict = "clear",
  cups = []
} = {}) {
  return {
    id,
    pos_id: pos,
    tran_no: id,
    started_at: started,
    payment_verification: payment,
    ingestion_status: status,
    conflict_status: conflict,
    cups
  };
}

function cup(id, status = "pending", group = "Trà sữa") {
  return {
    id,
    status,
    item_name: "Đồ uống " + id,
    item_group: group,
    served_at: status === "served"
      ? "2026-10-02T14:20:00Z"
      : null
  };
}

function run(orders, options = {}) {
  return buildOperationsReadModel({
    orders,
    now: NOW,
    warningMinutes: 10,
    criticalMinutes: 15,
    ...options
  });
}

test("FIFO uses order start, not input order", () => {
  const result = run([
    order({ id: "NEW", started:
      "2026-10-02T14:25:00Z",
      cups: [cup("C2")] }),
    order({ id: "OLD", cups: [cup("C1")] })
  ]);
  assert.deepEqual(
    result.queue.map(x => x.order_id),
    ["OLD", "NEW"]
  );
});

test("Unverified orders are excluded", () => {
  const result = run([
    order({
      payment: "pending_verification",
      cups: [cup("C1")]
    })
  ]);
  assert.equal(result.queue.length, 0);
});

test("Unprocessed and conflicted orders are excluded", () => {
  const result = run([
    order({ id: "O1", status: "pending",
      cups: [cup("C1")] }),
    order({ id: "O2", conflict: "review_required",
      cups: [cup("C2")] })
  ]);
  assert.equal(result.queue.length, 0);
});

test("Prepared cups move to serving queue", () => {
  const result = run([
    order({ cups: [
      cup("C1", "pending"),
      cup("C2", "prepared")
    ] })
  ]);
  assert.equal(result.preparation_queue.length, 1);
  assert.equal(result.serving_queue.length, 1);
});

test("Group totals count individual unserved cups", () => {
  const result = run([
    order({ cups: [
      cup("C1"),
      cup("C2"),
      cup("C3", "prepared", "Trà hoa quả")
    ] })
  ]);
  assert.equal(
    result.group_counts.reduce(
      (sum, x) => sum + x.total_unserved, 0
    ), 3
  );
});

test("SLA flags older unserved orders", () => {
  const result = run([
    order({ cups: [cup("C1"), cup("C2")] })
  ]);
  assert.equal(result.queue[0].severity, "critical");
  assert.equal(result.overdue_orders.length, 1);
});

test("Completed order time ends at last served cup", () => {
  const result = run([
    order({ cups: [
      cup("C1", "served"),
      cup("C2", "served")
    ] })
  ]);
  assert.equal(result.completed_orders.length, 1);
  assert.equal(
    result.completed_orders[0].duration_minutes, 10
  );
});

test("Partially served order is not complete", () => {
  const result = run([
    order({ cups: [
      cup("C1", "served"),
      cup("C2", "pending")
    ] })
  ]);
  assert.equal(result.completed_orders.length, 0);
});

test("Branch filter is isolated", () => {
  const result = run([
    order({ id: "O1", pos: 101, cups: [cup("C1")] }),
    order({ id: "O2", pos: 102, cups: [cup("C2")] })
  ], { posId: 101 });
  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0].pos_id, "101");
});

test("Group filter preserves group totals", () => {
  const result = run([
    order({ cups: [
      cup("C1", "pending", "Trà sữa"),
      cup("C2", "pending", "Cà phê")
    ] })
  ], { group: "Cà phê" });
  assert.equal(result.queue.length, 1);
  assert.equal(result.group_counts.length, 2);
});

test("Duplicate cup identity is rejected", () => {
  assert.throws(() => run([
    order({ cups: [cup("C1"), cup("C1")] })
  ]), /KDS_INVALID_CUP_IDENTITY/);
});

test("Timezone-less start is rejected", () => {
  assert.throws(() => run([
    order({
      started: "2026-10-02 14:00:00",
      cups: [cup("C1")]
    })
  ]), /KDS_INVALID_ORDER_STARTED_AT/);
});

test("Invalid SLA policy is rejected", () => {
  assert.throws(() => run([], {
    warningMinutes: 15,
    criticalMinutes: 10
  }), /KDS_INVALID_SLA_POLICY/);
});
