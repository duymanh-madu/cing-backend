"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.resolve(
    __dirname,
    "../cingPointsReviveCreditIposSyncWorker.js"
  ),
  "utf8"
);

const PURCHASE_ID =
  "11111111-1111-4111-8111-111111111111";

function createHarness({
  enabled = true,
  logResults = [],
  pointError = null,
} = {}) {
  const calls = {
    minus: [],
    lookup: [],
    alerts: [],
    redis: [],
    changes: [],
  };

  const row = {
    id: PURCHASE_ID,
    user_id: "0987654321",
    total_points: 5,
    ipos_sync_status: "pending",
    ipos_retry_count: 0,
    ipos_next_retry_at:
      "2026-09-01T00:00:00.000Z",
    ipos_first_attempt_at: null,
    ipos_locked_until: null,
    created_at:
      "2026-09-01T00:00:00.000Z",
  };

  const supabase = {
    from(table) {
      assert.equal(table, "cing_points_revive_credit_purchases");
      return {
        select() {
          return {
            eq() { return this; },
            async maybeSingle() { return { data: { ...row }, error: null }; },
          };
        },
        update() { throw new Error("DIRECT_QUEUE_UPDATE_FORBIDDEN"); },
      };
    },
    async rpc(name, args) {
      assert.equal(name, "cing_points_revive_ipos_queue_transition_v1");
      const action = args.p_action;
      if (action === "claim") {
        if (row.ipos_sync_status !== "pending") return { data: [], error: null };
        Object.assign(row, {
          ipos_sync_status: "processing",
          ipos_claim_token: args.p_claim_token,
          ipos_locked_until: new Date(Date.now() + 1800000).toISOString(),
        });
      } else {
        if (row.ipos_claim_token !== args.p_claim_token ||
            row.ipos_sync_status !== "processing") {
          return { data: null, error: new Error("POINTS_REVIVE_QUEUE_OWNER_LOST") };
        }
        if (action === "start") {
          row.ipos_first_attempt_at ||= new Date().toISOString();
        } else if (action === "synced") {
          row.ipos_sync_status = "synced";
          row.ipos_claim_token = null;
        } else if (action === "failed") {
          row.ipos_retry_count += 1;
          row.ipos_sync_status = row.ipos_retry_count >= 6 ? "failed" : "pending";
          row.ipos_claim_token = null;
        } else {
          throw new Error("unexpected queue action");
        }
      }
      calls.changes.push({ action });
      return { data: [{ ...row }], error: null };
    },
  };

  const redis = {
    async set(...args) {
      calls.redis.push(["set", ...args]);
      return "OK";
    },
    async eval(...args) {
      calls.redis.push(["eval", ...args]);
      return 1;
    },
  };

  let lookupIndex = 0;

  const foodbook = {
    async findMembershipLogByNote(
      phone,
      note,
      options
    ) {
      calls.lookup.push({
        phone,
        note,
        options,
      });

      const next =
        logResults[lookupIndex++];

      return next || {
        success: true,
        found: false,
        scanned_count: 0,
      };
    },

    async updateMemberPoint(args) {
      calls.minus.push(args);

      if (pointError) {
        throw pointError;
      }

      return { success: true };
    },
  };

  const exportsObject = {};

  const dependencies = {
    "../../../supabase": supabase,
    "../../infrastructure/cache/redisClient":
      redis,
    "../../foodbook": foodbook,
    "../../alerts/adminAlertService": {
      async sendAdminAlert(args) {
        calls.alerts.push(args);
      },
    },
  };

  const sandbox = {
    module: {
      exports: exportsObject,
    },
    exports: exportsObject,

    require(name) {
      if (name === "node:crypto") {
        return require("node:crypto");
      }

      if (!(name in dependencies)) {
        throw new Error(
          "Unexpected dependency: " + name
        );
      }

      return dependencies[name];
    },

    process: {
      env: {
        CING_POINTS_REVIVE_IPOS_SYNC_WORKER_ENABLED:
          enabled ? "true" : "false",
      },
    },

    Date,
    Number,
    String,
    Error,
    Math,
    Promise,
  };

  vm.runInNewContext(
    SOURCE,
    sandbox,
    {
      filename:
        "cingPointsReviveCreditIposSyncWorker.js",
    }
  );

  return {
    worker:
      sandbox.module.exports,
    row,
    calls,
  };
}

const found = {
  success: true,
  found: true,
  scanned_count: 1,
};

const missing = {
  success: true,
  found: false,
  scanned_count: 0,
};

test(
  "disabled worker performs no DB or iPOS work",
  async () => {
    const h = createHarness({
      enabled: false,
    });

    const result =
      await h.worker
        .processCingPointsReviveIposSyncQueue();

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "worker_disabled");
    assert.equal(h.calls.minus.length, 0);
    assert.equal(h.calls.lookup.length, 0);
    assert.equal(h.calls.changes.length, 0);
  }
);

test(
  "existing iPOS marker prevents duplicate MINUS",
  async () => {
    const h = createHarness({
      logResults: [found],
    });

    const result =
      await h.worker
        .processCingPointsReviveIposSyncQueue();

    assert.equal(result.success, true);
    assert.equal(result.stats.success, 1);
    assert.equal(h.calls.minus.length, 0);
    assert.equal(h.row.ipos_sync_status, "synced");
  }
);

test(
  "missing marker sends one MINUS and verifies postflight",
  async () => {
    const h = createHarness({
      logResults: [missing, found],
    });

    const result =
      await h.worker
        .processCingPointsReviveIposSyncQueue();

    assert.equal(result.success, true);
    assert.equal(result.stats.success, 1);
    assert.equal(h.calls.minus.length, 1);

    assert.equal(
      h.calls.minus[0].point_change,
      5
    );

    assert.equal(
      h.calls.minus[0].type_change,
      "MINUS"
    );

    assert.equal(h.calls.lookup.length, 2);
    assert.equal(h.row.ipos_sync_status, "synced");
  }
);

test(
  "unverified postflight does not mark purchase synced",
  async () => {
    const h = createHarness({
      logResults: [missing, missing],
    });

    const result =
      await h.worker
        .processCingPointsReviveIposSyncQueue();

    assert.equal(result.success, true);
    assert.equal(result.stats.failed, 1);
    assert.equal(h.calls.minus.length, 1);
    assert.equal(h.row.ipos_sync_status, "pending");
    assert.equal(h.row.ipos_retry_count, 1);
  }
);

test(
  "failed preflight must never send MINUS",
  async () => {
    const h = createHarness({
      logResults: [{
        success: false,
        found: false,
        error: "ipos_unavailable",
      }],
    });

    const result =
      await h.worker
        .processCingPointsReviveIposSyncQueue();

    assert.equal(result.stats.failed, 1);
    assert.equal(h.calls.minus.length, 0);
    assert.equal(h.row.ipos_sync_status, "pending");
  }
);

test(
  "marker on page two prevents a duplicate deduction",
  async () => {
    const h = createHarness({
      logResults: [
        {
          success: true,
          found: false,
          scanned_count: 100,
        },
        found,
      ],
    });

    const result =
      await h.worker
        .processCingPointsReviveIposSyncQueue();

    assert.equal(result.stats.success, 1);
    assert.equal(h.calls.lookup.length, 2);
    assert.equal(
      h.calls.lookup[1].options.page,
      2
    );
    assert.equal(h.calls.minus.length, 0);
  }
);

test(
  "invalid pagination fails closed without MINUS",
  async () => {
    const h = createHarness({
      logResults: [{
        success: true,
        found: false,
        scanned_count: "invalid",
      }],
    });

    const result =
      await h.worker
        .processCingPointsReviveIposSyncQueue();

    assert.equal(result.stats.failed, 1);
    assert.equal(h.calls.minus.length, 0);
  }
);

test(
  "Redis lock release uses ownership token",
  async () => {
    const h = createHarness({
      logResults: [found],
    });

    await h.worker
      .processCingPointsReviveIposSyncQueue();

    const acquire =
      h.calls.redis.find(
        item => item[0] === "set"
      );

    const release =
      h.calls.redis.find(
        item => item[0] === "eval"
      );

    assert.ok(acquire);
    assert.ok(release);
    assert.equal(
      acquire[2],
      release[4]
    );
  }
);


test(
  "stale claim token is rejected by queue RPC without a second MINUS",
  async () => {
    const h = createHarness({ logResults: [found] });
    const first = await h.worker.processCingPointsReviveIposSyncQueue();
    assert.equal(first.success, true);
    assert.equal(h.row.ipos_sync_status, "synced");
    assert.equal(h.calls.minus.length, 0);
    assert.equal(h.row.ipos_claim_token, null);
  }
);
