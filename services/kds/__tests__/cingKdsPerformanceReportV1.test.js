"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPerformanceReport
} = require("../cingKdsPerformanceReportV1");

const NOW = "2026-10-02T15:00:00Z";

const policies = [
  {
    pos_parent: "CING",
    pos_id: 101,
    warning_minutes: 10,
    critical_minutes: 15,
    enabled: true
  },
  {
    pos_parent: "OTHER",
    pos_id: 101,
    warning_minutes: 20,
    critical_minutes: 30,
    enabled: true
  }
];

function makeOrder({
  id = "O1",
  parent = "CING",
  pos = 101,
  started = "2026-10-02T14:40:00Z",
  served = false
} = {}) {
  return {
    id,
    pos_parent: parent,
    pos_id: pos,
    started_at: started,
    payment_verification: "verified",
    ingestion_status: "processed",
    conflict_status: "clear",
    cups: [{
      id: `${id}-C1`,
      status: served ? "served" : "pending",
      served_at: served
        ? "2026-10-02T14:50:00Z"
        : null
    }]
  };
}

function run(orders, options = {}) {
  return buildPerformanceReport({
    orders,
    policies,
    now: NOW,
    ...options
  });
}

test("Active overdue order creates alert candidate", () => {
  const r = run([makeOrder()]);

  assert.equal(r.active_alert_candidates.length, 1);
  assert.equal(
    r.active_alert_candidates[0].severity,
    "critical"
  );
});

test("Completed order does not create active alert", () => {
  const r = run([makeOrder({ served: true })]);

  assert.equal(r.active_alert_candidates.length, 0);
  assert.equal(r.completed_history.length, 1);
  assert.equal(r.completed_history[0].duration_minutes, 10);
});

test("Duration filter selects completed orders", () => {
  const r = run([
    makeOrder({ id: "O1", served: true }),
    makeOrder({ id: "O2" })
  ], {
    durationMin: 11,
    durationMax: 20
  });

  assert.equal(r.completed_history.length, 0);
  assert.equal(r.active_alert_candidates.length, 1);
});

test("Distinct POS parents remain isolated", () => {
  const r = run([
    makeOrder({ id: "A" }),
    makeOrder({
      id: "B",
      parent: "OTHER"
    })
  ]);

  assert.equal(r.branches.length, 2);
  assert.equal(r.active_alert_candidates.length, 2);

  const byParent = new Map(
    r.active_alert_candidates.map(
      alert => [alert.pos_parent, alert]
    )
  );

  assert.equal(byParent.get("CING").severity, "critical");
  assert.equal(byParent.get("OTHER").severity, "warning");

  assert.notEqual(
    byParent.get("CING").alert_key,
    byParent.get("OTHER").alert_key
  );
});

test("Repeated evaluation uses stable alert identity", () => {
  const a = run([makeOrder()]);
  const b = run([makeOrder()]);

  assert.equal(
    a.active_alert_candidates[0].alert_key,
    b.active_alert_candidates[0].alert_key
  );
});

test("SLA exact warning boundary", () => {
  const r = run([
    makeOrder({
      started: "2026-10-02T14:50:00Z"
    })
  ]);

  assert.equal(
    r.active_alert_candidates[0].severity,
    "warning"
  );
});

test("SLA exact critical boundary", () => {
  const r = run([
    makeOrder({
      started: "2026-10-02T14:45:00Z"
    })
  ]);

  assert.equal(
    r.active_alert_candidates[0].severity,
    "critical"
  );
});

test("Disabled policy suppresses alerts", () => {
  const r = run([makeOrder()], {
    policies: [{
      ...policies[0],
      enabled: false
    }]
  });

  assert.equal(r.active_alert_candidates.length, 0);
  assert.equal(r.branches[0].active_orders, 1);
});

test("Unverified order is excluded", () => {
  const o = makeOrder();
  o.payment_verification = "pending_verification";

  assert.equal(run([o]).branches.length, 0);
});

test("Missing branch policy is rejected", () => {
  assert.throws(
    () => run([makeOrder()], { policies: [] }),
    /KDS_SLA_POLICY_MISSING/
  );
});

test("Duplicate order is rejected", () => {
  const o = makeOrder();

  assert.throws(
    () => run([o, o]),
    /KDS_DUPLICATE_ORDER/
  );
});

test("Timezone-less timestamps are rejected", () => {
  assert.throws(
    () => run([
      makeOrder({
        started: "2026-10-02 14:40:00"
      })
    ]),
    /KDS_TIMESTAMP_REQUIRED/
  );
});

test("Completed report computes branch metrics", () => {
  const r = run([
    makeOrder({ id: "O1", served: true }),
    makeOrder({ id: "O2", served: true })
  ]);

  assert.equal(r.branches[0].completed_orders, 2);
  assert.equal(r.branches[0].avg_minutes, 10);
  assert.equal(r.branches[0].p90_minutes, 10);
});

test("Invalid duration range is rejected", () => {
  assert.throws(
    () => run([], {
      durationMin: 20,
      durationMax: 10
    }),
    /KDS_INVALID_DURATION_RANGE/
  );
});
