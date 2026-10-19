"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createC03PollCoordinatorV1
} = require("../cingKdsFabiC03PollCoordinatorV1");

function sale(tranId, tranNo = tranId) {
  return {
    brand_id: "BRAND-DQIR",
    device_code: "POS-1",
    tran_id: tranId,
    tran_no: tranNo,
    deleted: false,
    sale_payment_method: [
      {
        is_paid: 1,
        deleted: false
      }
    ],
    sale_detail: [
      {
        id_sale_detail: `LINE-${tranId}`,
        item_id: "ITEM-1",
        item_name: "TEST DRINK",
        item_class_id: "DU",
        item_type_id: "DRINK",
        quantity: 1,
        note: "",
        toppings: [],
        deleted: false
      }
    ]
  };
}

function makeCoordinator({
  listRows = [],
  details = {},
  processed = [],
  persistImpl,
  delayList
} = {}) {
  const detailCalls = [];
  const persisted = [];
  const processedSet = new Set(processed);

  const api = {
    listSales: async () => {
      if (delayList) {
        await delayList();
      }

      return {
        data: listRows,
        track_id: "LIST-TRACK"
      };
    },

    getSaleDetail: async ({ search }) => {
      detailCalls.push(search);

      return {
        data: details[search] || [],
        track_id: `DETAIL-${search}`
      };
    }
  };

  const coordinator =
    createC03PollCoordinatorV1({
      api,
      hasProcessed: async tranId =>
        processedSet.has(tranId),
      persist: async envelope => {
        if (persistImpl) {
          await persistImpl(envelope);
        }
        persisted.push(envelope);
      },
      now: () => 1792000000000
    });

  return {
    coordinator,
    detailCalls,
    persisted
  };
}

const QUERY = {
  companyUid: "COMPANY-1",
  brandUid: "BRAND-1",
  storeUid: "STORE-1",
  startDate: 1000,
  endDate: 2000
};

test("Empty list performs no detail fetch",
async () => {
  const {
    coordinator,
    detailCalls,
    persisted
  } = makeCoordinator();

  const result =
    await coordinator.poll(QUERY);

  assert.equal(result.listed_count, 0);
  assert.equal(result.accepted_count, 0);
  assert.equal(detailCalls.length, 0);
  assert.equal(persisted.length, 0);
});

test("New transaction fetches detail once",
async () => {
  const row = {
    tran_id: "TX-1",
    tran_no: "000001"
  };

  const {
    coordinator,
    detailCalls,
    persisted
  } = makeCoordinator({
    listRows: [row],
    details: {
      "000001": [sale("TX-1", "000001")]
    }
  });

  const result =
    await coordinator.poll(QUERY);

  assert.deepEqual(
    detailCalls,
    ["000001"]
  );
  assert.equal(persisted.length, 1);
  assert.equal(result.accepted_count, 1);
});

test("Already processed transaction skips detail",
async () => {
  const {
    coordinator,
    detailCalls,
    persisted
  } = makeCoordinator({
    listRows: [{
      tran_id: "TX-1",
      tran_no: "000001"
    }],
    processed: ["TX-1"]
  });

  const result =
    await coordinator.poll(QUERY);

  assert.equal(detailCalls.length, 0);
  assert.equal(persisted.length, 0);
  assert.equal(result.skipped_count, 1);
});

test("Missing tran_no falls back to tran_id",
async () => {
  const {
    coordinator,
    detailCalls
  } = makeCoordinator({
    listRows: [{
      tran_id: "TX-1"
    }],
    details: {
      "TX-1": [sale("TX-1")]
    }
  });

  await coordinator.poll(QUERY);

  assert.deepEqual(
    detailCalls,
    ["TX-1"]
  );
});

test("Detail must match exact tran_id",
async () => {
  const {
    coordinator,
    persisted
  } = makeCoordinator({
    listRows: [{
      tran_id: "TX-1",
      tran_no: "000001"
    }],
    details: {
      "000001": [
        sale("TX-OTHER", "000001")
      ]
    }
  });

  await assert.rejects(
    coordinator.poll(QUERY),
    error =>
      error.code ===
      "C03_POLL_DETAIL_MISMATCH"
  );

  assert.equal(persisted.length, 0);
});

test("Ambiguous detail response fails closed",
async () => {
  const {
    coordinator
  } = makeCoordinator({
    listRows: [{
      tran_id: "TX-1",
      tran_no: "000001"
    }],
    details: {
      "000001": [
        sale("TX-1", "000001"),
        sale("TX-1", "000001")
      ]
    }
  });

  await assert.rejects(
    coordinator.poll(QUERY),
    error =>
      error.code ===
      "C03_POLL_DETAIL_MISMATCH"
  );
});

test("Duplicate tran_id in list fails closed",
async () => {
  const {
    coordinator
  } = makeCoordinator({
    listRows: [
      { tran_id: "TX-1" },
      { tran_id: "TX-1" }
    ]
  });

  await assert.rejects(
    coordinator.poll(QUERY),
    error =>
      error.code ===
      "C03_POLL_DUPLICATE_LIST_ID"
  );
});

test("Persist receives normalized C03 snapshot",
async () => {
  const {
    coordinator,
    persisted
  } = makeCoordinator({
    listRows: [{
      tran_id: "TX-1"
    }],
    details: {
      "TX-1": [sale("TX-1")]
    }
  });

  await coordinator.poll(QUERY);

  assert.equal(
    persisted[0].normalized.schema,
    "cing_fabi_c03_snapshot_v1"
  );
  assert.equal(
    persisted[0].normalized.invoices[0].tran_id,
    "TX-1"
  );
});

test("Persist occurs before transaction is accepted",
async () => {
  const {
    coordinator
  } = makeCoordinator({
    listRows: [{
      tran_id: "TX-1"
    }],
    details: {
      "TX-1": [sale("TX-1")]
    },
    persistImpl: async () => {
      const error =
        new Error("persist failed");
      error.code = "PERSIST_FAILED";
      throw error;
    }
  });

  await assert.rejects(
    coordinator.poll(QUERY),
    error =>
      error.code === "PERSIST_FAILED"
  );
});

test("Envelope contains source tracking IDs",
async () => {
  const {
    coordinator,
    persisted
  } = makeCoordinator({
    listRows: [{
      tran_id: "TX-1"
    }],
    details: {
      "TX-1": [sale("TX-1")]
    }
  });

  await coordinator.poll(QUERY);

  assert.equal(
    persisted[0].list_track_id,
    "LIST-TRACK"
  );
  assert.equal(
    persisted[0].detail_track_id,
    "DETAIL-TX-1"
  );
  assert.equal(
    persisted[0].observed_at_ms,
    1792000000000
  );
});

test("Fingerprint is present and deterministic",
async () => {
  const first =
    makeCoordinator({
      listRows: [{
        tran_id: "TX-1"
      }],
      details: {
        "TX-1": [sale("TX-1")]
      }
    });

  const second =
    makeCoordinator({
      listRows: [{
        tran_id: "TX-1"
      }],
      details: {
        "TX-1": [sale("TX-1")]
      }
    });

  await first.coordinator.poll(QUERY);
  await second.coordinator.poll(QUERY);

  assert.equal(
    first.persisted[0].fingerprint,
    second.persisted[0].fingerprint
  );
});

test("Grouped quantity is preserved in normalized line",
async () => {
  const grouped = sale("TX-1");
  grouped.sale_detail[0].quantity = 4;
  grouped.sale_detail[0].toppings = [{
    id_sale_detail: "TOP-1",
    item_id: "SUGAR",
    item_name: "30% ĐƯỜNG",
    item_class_id: "DU",
    item_type_id: "ITEM_TYPE_OTHER",
    quantity: 4,
    note: "",
    is_eat_with: 1,
    sub_topping: []
  }];

  const {
    coordinator,
    persisted
  } = makeCoordinator({
    listRows: [{
      tran_id: "TX-1"
    }],
    details: {
      "TX-1": [grouped]
    }
  });

  await coordinator.poll(QUERY);

  const line =
    persisted[0]
      .normalized
      .invoices[0]
      .lines[0];

  assert.equal(line.quantity, 4);
  assert.equal(
    line.modifiers[0].quantity,
    4
  );
});

test("Auth error propagates without persist",
async () => {
  const persisted = [];

  const coordinator =
    createC03PollCoordinatorV1({
      api: {
        listSales: async () => {
          const error =
            new Error("auth");
          error.code =
            "C03_AUTH_REQUIRED";
          throw error;
        },
        getSaleDetail:
          async () => {
            throw new Error(
              "must not execute"
            );
          }
      },
      hasProcessed: async () => false,
      persist: async envelope => {
        persisted.push(envelope);
      }
    });

  await assert.rejects(
    coordinator.poll(QUERY),
    error =>
      error.code ===
      "C03_AUTH_REQUIRED"
  );

  assert.equal(persisted.length, 0);
});

test("Rate limit propagates without stale publish",
async () => {
  const persisted = [];

  const coordinator =
    createC03PollCoordinatorV1({
      api: {
        listSales: async () => {
          const error =
            new Error("rate");
          error.code =
            "C03_RATE_LIMITED";
          throw error;
        },
        getSaleDetail:
          async () => []
      },
      hasProcessed: async () => false,
      persist: async envelope => {
        persisted.push(envelope);
      }
    });

  await assert.rejects(
    coordinator.poll(QUERY),
    error =>
      error.code ===
      "C03_RATE_LIMITED"
  );

  assert.equal(persisted.length, 0);
});

test("Concurrent poll is rejected",
async () => {
  let release;

  const gate =
    new Promise(resolve => {
      release = resolve;
    });

  const {
    coordinator
  } = makeCoordinator({
    delayList: async () => gate
  });

  const first =
    coordinator.poll(QUERY);

  await new Promise(
    resolve => setImmediate(resolve)
  );

  await assert.rejects(
    coordinator.poll(QUERY),
    error =>
      error.code === "C03_POLL_BUSY"
  );

  release();

  await first;
});

test("Coordinator can poll again after failure",
async () => {
  let calls = 0;

  const coordinator =
    createC03PollCoordinatorV1({
      api: {
        listSales: async () => {
          calls++;

          if (calls === 1) {
            throw Object.assign(
              new Error("temporary"),
              {
                code:
                  "C03_UPSTREAM_ERROR"
              }
            );
          }

          return {
            data: []
          };
        },

        getSaleDetail:
          async () => ({
            data: []
          })
      },

      hasProcessed: async () => false,
      persist: async () => {}
    });

  await assert.rejects(
    coordinator.poll(QUERY)
  );

  const result =
    await coordinator.poll(QUERY);

  assert.equal(result.listed_count, 0);
});

test("Close blocks future poll",
async () => {
  const {
    coordinator
  } = makeCoordinator();

  coordinator.close();

  await assert.rejects(
    coordinator.poll(QUERY),
    error =>
      error.code === "C03_POLL_CLOSED"
  );
});

test("Status exposes only lifecycle state", () => {
  const {
    coordinator
  } = makeCoordinator();

  assert.deepEqual(
    coordinator.status(),
    {
      closed: false,
      running: false
    }
  );

  coordinator.close();

  assert.deepEqual(
    coordinator.status(),
    {
      closed: true,
      running: false
    }
  );
});
