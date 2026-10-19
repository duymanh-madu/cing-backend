"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeEvent11
} = require("../cingKdsEvent11NormalizerV1");

const {
  transitionCup
} = require("../cingKdsCupStateV1");

const {
  evaluateSla
} = require("../cingKdsSlaV1");

function event11() {
  return {
    event_id: 11,
    event: "sale_manager",
    timestamp: "1790955786871",
    sale_manager: {
      id: "source-1",
      pos_parent: "CING",
      pos_id: 101,
      tran_id: "TRAN-01",
      tran_no: "TA0014",
      tran_date: "2026-10-02 20:00:00",
      items: [
        {
          item_id: "TC01",
          item_name: "Trân châu đường đen",
          quantity: 2
        },
        {
          item_id: "FR01",
          item_name: "Trà hoa quả",
          quantity: 1
        }
      ]
    }
  };
}

test("Event 11 accepts non-CRM orders", () => {
  const result = normalizeEvent11(event11());

  assert.equal(result.total_cups, 3);
  assert.equal(result.pos_id, 101);
  assert.equal(
    result.payment_verification,
    "pending_verification"
  );
});

test("Quantity creates independent cup identities", () => {
  const result = normalizeEvent11(event11());

  assert.deepEqual(
    result.cups.map(c => c.unit_key),
    ["0:0", "0:1", "1:0"]
  );
});

test("CRM presence does not change cup count", () => {
  const body = event11();

  body.sale_manager.membership_id = "TEST-MEMBER";

  assert.equal(
    normalizeEvent11(body).total_cups,
    3
  );
});

test("Wrong event is rejected", () => {
  const body = event11();
  body.event_id = 10;

  assert.throws(
    () => normalizeEvent11(body),
    /KDS_NOT_EVENT_11/
  );
});

test("Invalid quantity is rejected", () => {
  const body = event11();
  body.sale_manager.items[0].quantity = 0;

  assert.throws(
    () => normalizeEvent11(body),
    /KDS_INVALID_ITEM_QUANTITY/
  );
});

test("Missing transaction identity is rejected", () => {
  const body = event11();
  delete body.sale_manager.tran_id;

  assert.throws(
    () => normalizeEvent11(body),
    /KDS_REQUIRED_TRAN_ID/
  );
});

test("POS time is preserved without timezone guessing", () => {
  const result = normalizeEvent11(event11());

  assert.equal(
    result.tran_date_raw,
    "2026-10-02 20:00:00"
  );
});

test("Cup transitions follow approved sequence", () => {
  let cup = { status: "pending", version: 0 };

  for (const status of [
    "preparing",
    "prepared",
    "served"
  ]) {
    const result = transitionCup({
      cup,
      targetStatus: status,
      actorId: "barista-1",
      actionKey: `action-${status}`,
      expectedVersion: cup.version,
      now: "2026-10-02T14:00:00Z"
    });

    cup = result.cup;
  }

  assert.equal(cup.status, "served");
  assert.equal(cup.version, 3);
});

test("Cup cannot skip preparation", () => {
  assert.throws(() => transitionCup({
    cup: { status: "pending", version: 0 },
    targetStatus: "served",
    actorId: "barista-1",
    actionKey: "action-1",
    expectedVersion: 0,
    now: "2026-10-02T14:00:00Z"
  }), /KDS_INVALID_TRANSITION/);
});

test("Stale concurrent cup version is rejected", () => {
  assert.throws(() => transitionCup({
    cup: { status: "preparing", version: 1 },
    targetStatus: "prepared",
    actorId: "barista-1",
    actionKey: "action-2",
    expectedVersion: 0,
    now: "2026-10-02T14:00:00Z"
  }), /KDS_VERSION_CONFLICT/);
});

test("SLA boundary is exact", () => {
  const result = evaluateSla({
    startedAt: "2026-10-02T14:00:00Z",
    now: "2026-10-02T14:15:00Z",
    warningMinutes: 10,
    criticalMinutes: 15
  });

  assert.equal(result.severity, "critical");
  assert.equal(result.elapsed_minutes, 15);
});

test("Completed SLA uses completion timestamp", () => {
  const result = evaluateSla({
    startedAt: "2026-10-02T14:00:00Z",
    completedAt: "2026-10-02T14:07:00Z",
    now: "2026-10-02T15:00:00Z",
    warningMinutes: 10,
    criticalMinutes: 15
  });

  assert.equal(result.elapsed_minutes, 7);
  assert.equal(result.completed, true);
  assert.equal(result.severity, "normal");
});

test("Invalid SLA policy is rejected", () => {
  assert.throws(() => evaluateSla({
    startedAt: "2026-10-02T14:00:00Z",
    now: "2026-10-02T14:12:00Z",
    warningMinutes: 15,
    criticalMinutes: 10
  }), /KDS_INVALID_SLA_POLICY/);
});
