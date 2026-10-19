"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ROUTES,
  createKdsOperationsHandlers,
  createKdsOperationsRouter
} = require("../../../routes/kdsOperationsRoutesV1");

const BRANCH = {
  pos_parent: "CING",
  pos_id: 101
};

function order(id, parent = "CING") {
  return {
    id,
    pos_parent: parent,
    pos_id: 101,
    tran_no: id,
    started_at: "2026-10-02T14:40:00Z",
    payment_verification: "verified",
    ingestion_status: "processed",
    conflict_status: "clear",
    cups: [{
      id: `CUP-${id}`,
      item_name: "Trà sữa",
      item_group: "Trà sữa",
      status: "pending"
    }]
  };
}

function dependencies(overrides = {}) {
  return {
    authenticate: async () => ({
      authenticated: true,
      admin_id: "admin-1"
    }),
    loadGrants: async () => [
      {
        ...BRANCH,
        permission: "kds.orders.read",
        enabled: true
      },
      {
        ...BRANCH,
        permission: "kds.reports.read",
        enabled: true
      }
    ],
    loadOrders: async () => [
      order("ALLOWED"),
      order("FOREIGN", "OTHER")
    ],
    loadPolicy: async () => ({
      ...BRANCH,
      warning_minutes: 10,
      critical_minutes: 15,
      enabled: true
    }),
    clock: () => "2026-10-02T15:00:00Z",
    ...overrides
  };
}

async function invoke(kind, deps, query = BRANCH) {
  const handlers = createKdsOperationsHandlers(
    deps
  );

  const result = {
    statusCode: null,
    body: null,
    headers: {}
  };

  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      result.headers[k] = v;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    }
  };

  await handlers[kind]({ query }, res);

  return result;
}

test("Factory rejects missing trusted adapters", () => {
  assert.throws(
    () => createKdsOperationsRouter({}),
    /KDS_ADAPTER_REQUIRED/
  );
});

test("Five expected endpoint contracts exist", () => {
  assert.deepEqual(Object.values(ROUTES), [
    "/orders",
    "/serving",
    "/history",
    "/performance",
    "/sla-alerts"
  ]);
});

test("Orders endpoint is isolated by branch tuple", async () => {
  const r = await invoke("orders", dependencies());

  assert.equal(r.statusCode, 200);
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].order_id, "ALLOWED");
});

test("Unauthenticated caller is denied", async () => {
  const r = await invoke("orders", dependencies({
    authenticate: async () => null
  }));

  assert.equal(r.statusCode, 401);
});

test("No branch grant means no data", async () => {
  const r = await invoke("orders", dependencies({
    loadGrants: async () => []
  }));

  assert.equal(r.statusCode, 403);
});

test("Cross-parent branch access is denied", async () => {
  const r = await invoke(
    "orders",
    dependencies(),
    { pos_parent: "OTHER", pos_id: 101 }
  );

  assert.equal(r.statusCode, 403);
});

test("Reports require separate permission", async () => {
  const r = await invoke("performance", dependencies({
    loadGrants: async () => [{
      ...BRANCH,
      permission: "kds.orders.read",
      enabled: true
    }]
  }));

  assert.equal(r.statusCode, 403);
});

test("Reports return only authorized branch", async () => {
  const r = await invoke(
    "performance",
    dependencies()
  );

  assert.equal(r.statusCode, 200);
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].pos_parent, "CING");
});

test("Foreign SLA policy fails closed", async () => {
  const r = await invoke("orders", dependencies({
    loadPolicy: async () => ({
      pos_parent: "OTHER",
      pos_id: 101,
      warning_minutes: 10,
      critical_minutes: 15,
      enabled: true
    })
  }));

  assert.equal(r.statusCode, 503);
});

test("Unverified payment is not exposed", async () => {
  const unverified = order("UNVERIFIED");
  unverified.payment_verification =
    "pending_verification";

  const r = await invoke("orders", dependencies({
    loadOrders: async () => [unverified]
  }));

  assert.equal(r.statusCode, 200);
  assert.equal(r.body.data.length, 0);
});

test("Database failures fail closed", async () => {
  const r = await invoke("orders", dependencies({
    loadOrders: async () => {
      throw new Error("PRIVATE_DATABASE_ERROR");
    }
  }));

  assert.equal(r.statusCode, 503);
  assert.equal(
    JSON.stringify(r.body).includes(
      "PRIVATE_DATABASE_ERROR"
    ),
    false
  );
});

test("Responses disable caching", async () => {
  const r = await invoke("orders", dependencies());

  assert.equal(
    r.headers["Cache-Control"],
    "no-store"
  );
});
