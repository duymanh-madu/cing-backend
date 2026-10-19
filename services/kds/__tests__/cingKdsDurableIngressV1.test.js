const test = require("node:test");
const assert = require("node:assert/strict");

const {
  makeKdsDurableIngress
} = require("../cingKdsDurableIngressV1");

const ID = "123e4567-e89b-42d3-a456-426614174000";

function event11(overrides = {}) {
  return {
    event: "sale_manager",
    event_id: 11,
    sale_manager: {
      pos_parent: "LOCAL_TEST",
      pos_id: 101,
      tran_id: "TX-001",
      items: [{
        item_id: "TEA",
        item_name: "Trà sữa",
        quantity: 2
      }],
      ...overrides
    }
  };
}

function create(options = {}) {
  const calls = [];

  const verifySource = options.verifySource ||
    (async () => true);

  const persist = options.persist ||
    (async candidate => {
      calls.push(candidate);
      return {
        outcome: "inserted",
        inbox_id: ID
      };
    });

  return {
    ingress: makeKdsDurableIngress({
      verifySource,
      persist
    }),
    calls
  };
}

test("Missing dependencies fail closed", () => {
  assert.throws(
    () => makeKdsDurableIngress(),
    /KDS_INGRESS_DEPENDENCIES_REQUIRED/
  );
});

test("Guest order is admitted without member or phone", async () => {
  const { ingress, calls } = create();
  const result = await ingress({
    body: event11(),
    headers: {}
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].total_cups, 2);
  assert.equal(calls[0].tran_id, "TX-001");
});

test("Payment remains pending verification", async () => {
  const { ingress } = create();
  const result = await ingress({ body: event11() });

  assert.equal(
    result.internal.payment_verification,
    "pending_verification"
  );
});

test("Missing source verification blocks persistence", async () => {
  const { ingress, calls } = create({
    verifySource: async () => false
  });

  const result = await ingress({ body: event11() });

  assert.equal(result.status, 401);
  assert.equal(calls.length, 0);
});

test("Verification outage does not ACK", async () => {
  const { ingress, calls } = create({
    verifySource: async () => {
      throw new Error("verification unavailable");
    }
  });

  const result = await ingress({ body: event11() });

  assert.equal(result.status, 503);
  assert.equal(calls.length, 0);
});

test("Invalid Event 11 does not reach persistence", async () => {
  const { ingress, calls } = create();

  const result = await ingress({
    body: {
      event: "membership_log",
      event_id: 10
    }
  });

  assert.equal(result.status, 422);
  assert.equal(calls.length, 0);
});

test("Missing quantity fails closed", async () => {
  const { ingress, calls } = create();

  const result = await ingress({
    body: event11({
      items: [{
        item_id: "TEA",
        item_name: "Trà sữa"
      }]
    })
  });

  assert.equal(result.status, 422);
  assert.equal(calls.length, 0);
});

test("Persistence failure does not ACK", async () => {
  const { ingress } = create({
    persist: async () => {
      throw new Error("database disconnected");
    }
  });

  const result = await ingress({ body: event11() });

  assert.equal(result.status, 503);
  assert.equal(result.body.success, false);
});

test("Unfinished durable write cannot ACK early", async () => {
  let finish;
  let settled = false;

  const pending = new Promise(resolve => {
    finish = resolve;
  });

  const { ingress } = create({
    persist: async () => pending
  });

  const request = ingress({ body: event11() });

  request.then(() => {
    settled = true;
  });

  await new Promise(resolve => setImmediate(resolve));

  assert.equal(settled, false);

  finish({
    outcome: "inserted",
    inbox_id: ID
  });

  const result = await request;

  assert.equal(result.status, 200);
  assert.equal(settled, true);
});

test("Durable duplicate is acknowledged safely", async () => {
  const { ingress } = create({
    persist: async () => ({
      outcome: "duplicate",
      inbox_id: ID
    })
  });

  const result = await ingress({ body: event11() });

  assert.equal(result.status, 200);
  assert.equal(result.internal.outcome, "duplicate");
});

test("Durable conflict is acknowledged but not approved", async () => {
  const { ingress } = create({
    persist: async () => ({
      outcome: "review_required",
      inbox_id: ID
    })
  });

  const result = await ingress({ body: event11() });

  assert.equal(result.status, 200);
  assert.equal(result.internal.outcome, "review_required");
  assert.equal(
    result.internal.payment_verification,
    "pending_verification"
  );
});

test("Invalid database receipt cannot ACK", async () => {
  const { ingress } = create({
    persist: async () => ({
      outcome: "inserted",
      inbox_id: null
    })
  });

  const result = await ingress({ body: event11() });

  assert.equal(result.status, 503);
});

test("Unknown persistence outcome cannot ACK", async () => {
  const { ingress } = create({
    persist: async () => ({
      outcome: "unverified",
      inbox_id: ID
    })
  });

  const result = await ingress({ body: event11() });

  assert.equal(result.status, 503);
});

test("No event_id fallback used for transaction identity", async () => {
  const { ingress, calls } = create();

  const first = await ingress({
    body: event11({ tran_id: "TX-001" })
  });

  const second = await ingress({
    body: event11({ tran_id: "TX-002" })
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(calls.length, 2);
  assert.notEqual(
    calls[0].tran_id,
    calls[1].tran_id
  );
});

test("Source fingerprint changes when quantity changes", async () => {
  const { ingress, calls } = create();

  await ingress({ body: event11() });

  await ingress({
    body: event11({
      items: [{
        item_id: "TEA",
        item_name: "Trà sữa",
        quantity: 3
      }]
    })
  });

  assert.equal(calls.length, 2);
  assert.notEqual(
    calls[0].fingerprint,
    calls[1].fingerprint
  );
});
