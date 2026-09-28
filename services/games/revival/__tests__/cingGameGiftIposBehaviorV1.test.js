"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(
  path.resolve(
    __dirname,
    "../cingGameGiftIposSyncWorker.js"
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
    sender_user_id: "0987654321",
    points_cost: 5,
    ipos_sync_status: "pending",
    ipos_retry_count: 0,
    ipos_next_retry_at:
      "2026-09-01T00:00:00.000Z",
    ipos_first_attempt_at: null,
    ipos_locked_until: null,
    created_at:
      "2026-09-01T00:00:00.000Z",
  };

  /*
   * Isolated Gift Delivery RPC simulator.
   *
   * Production worker must never directly mutate
   * cing_game_gift_purchases through PostgREST.
   *
   * Retry eligibility is accelerated in this
   * behavioral harness; real scheduling was
   * verified separately with PostgreSQL 17.
   */
  const supabase = {
    from() {
      throw new Error(
        "direct_gift_table_access_forbidden"
      );
    },

    async rpc(name, args = {}) {
      calls.changes.push({
        rpc: name,
        args: { ...args },
      });

      const failure = message => ({
        data: null,
        error: { message },
      });

      if (
        name ===
        "cing_game_gift_ipos_release_stuck_v1"
      ) {
        return {
          data: 0,
          error: null,
        };
      }

      if (
        name ===
        "cing_game_gift_ipos_claim_pending_v1"
      ) {
        assert.ok(
          Number.isSafeInteger(
            args.p_batch_size
          )
        );

        if (
          row.ipos_sync_status !== "pending"
        ) {
          return {
            data: [],
            error: null,
          };
        }

        row.ipos_sync_status =
          "processing";

        row.ipos_locked_until =
          new Date(
            Date.now() + 10 * 60 * 1000
          ).toISOString();

        return {
          data: [{ ...row }],
          error: null,
        };
      }

      const validLease =
        args.p_purchase_id === row.id &&
        row.ipos_sync_status ===
          "processing" &&
        args.p_locked_until ===
          row.ipos_locked_until;

      if (
        name ===
        "cing_game_gift_ipos_first_attempt_v1"
      ) {
        if (!validLease) {
          return failure(
            "game_gift_first_attempt_lease_lost"
          );
        }

        if (row.ipos_first_attempt_at) {
          return {
            data: {
              row: { ...row },
              send_allowed: false,
            },
            error: null,
          };
        }

        row.ipos_first_attempt_at =
          new Date().toISOString();

        return {
          data: {
            row: { ...row },
            send_allowed: true,
          },
          error: null,
        };
      }

      if (
        name ===
        "cing_game_gift_ipos_mark_synced_v1"
      ) {
        if (!validLease) {
          return failure(
            "game_gift_mark_synced_failed"
          );
        }

        row.ipos_sync_status =
          "synced";

        row.ipos_synced_at =
          new Date().toISOString();

        row.ipos_locked_until = null;
        row.ipos_last_error = null;

        return {
          data: true,
          error: null,
        };
      }

      if (
        name ===
        "cing_game_gift_ipos_mark_failed_v1"
      ) {
        if (!validLease) {
          return failure(
            "game_gift_mark_failed_lease_lost"
          );
        }

        row.ipos_retry_count += 1;

        const terminal =
          row.ipos_retry_count >= 6;

        row.ipos_sync_status =
          terminal
            ? "failed"
            : "pending";

        row.ipos_last_error =
          String(args.p_reason || "")
            .slice(0, 1000);

        const retryMinutes = [
          1, 5, 15, 60, 360, 1440
        ];

        const index =
          Math.min(
            row.ipos_retry_count - 1,
            retryMinutes.length - 1
          );

        row.ipos_next_retry_at =
          new Date(
            Date.now() +
            retryMinutes[index] * 60000
          ).toISOString();

        row.ipos_locked_until = null;

        return {
          data: {
            retry_count:
              row.ipos_retry_count,

            terminal,

            status:
              row.ipos_sync_status,

            next_retry_at:
              row.ipos_next_retry_at,
          },

          error: null,
        };
      }

      throw new Error(
        "unexpected_gift_rpc:" + name
      );
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
        CING_GAME_GIFT_IPOS_SYNC_WORKER_ENABLED:
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
        "cingGameGiftIposSyncWorker.js",
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
        .processCingGameGiftIposSyncQueue();

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
        .processCingGameGiftIposSyncQueue();

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
        .processCingGameGiftIposSyncQueue();

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
        .processCingGameGiftIposSyncQueue();

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
        .processCingGameGiftIposSyncQueue();

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
        .processCingGameGiftIposSyncQueue();

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
        .processCingGameGiftIposSyncQueue();

    assert.equal(result.stats.failed, 1);
    assert.equal(h.calls.minus.length, 0);
  }
);

/*
 * GIFT SINGLE-SEND FINANCIAL SAFETY
 *
 * Once the durable first-attempt fence is written,
 * a retry must never submit another iPOS MINUS.
 */

test(
  "single-send fence prevents second MINUS after HTTP timeout",
  async () => {
    const h = createHarness({
      pointError:
        new Error("ETIMEDOUT"),
      logResults: [
        missing,
        missing,
        missing,
      ],
    });

    const first =
      await h.worker
        .processCingGameGiftIposSyncQueue();

    assert.equal(first.stats.failed, 1);
    assert.equal(h.calls.minus.length, 1);
    assert.ok(
      h.row.ipos_first_attempt_at
    );
    assert.equal(
      h.row.ipos_sync_status,
      "pending"
    );

    const second =
      await h.worker
        .processCingGameGiftIposSyncQueue();

    assert.equal(second.stats.failed, 1);
    assert.equal(h.calls.minus.length, 1);
    assert.equal(
      h.row.ipos_sync_status,
      "pending"
    );
    assert.equal(
      h.row.ipos_retry_count,
      2
    );
  }
);

test(
  "late iPOS marker resolves timeout without second MINUS",
  async () => {
    const h = createHarness({
      pointError:
        new Error("ETIMEDOUT"),
      logResults: [
        missing,
        found,
      ],
    });

    const first =
      await h.worker
        .processCingGameGiftIposSyncQueue();

    assert.equal(first.stats.failed, 1);
    assert.equal(h.calls.minus.length, 1);

    const second =
      await h.worker
        .processCingGameGiftIposSyncQueue();

    assert.equal(second.stats.success, 1);
    assert.equal(h.calls.minus.length, 1);
    assert.equal(
      h.row.ipos_sync_status,
      "synced"
    );
  }
);

test(
  "failed preflight leaves send right available",
  async () => {
    const h = createHarness({
      logResults: [
        {
          success: false,
          found: false,
          error: "ipos_unavailable",
        },
        missing,
        found,
      ],
    });

    const first =
      await h.worker
        .processCingGameGiftIposSyncQueue();

    assert.equal(first.stats.failed, 1);
    assert.equal(h.calls.minus.length, 0);
    assert.equal(
      h.row.ipos_first_attempt_at,
      null
    );

    const second =
      await h.worker
        .processCingGameGiftIposSyncQueue();

    assert.equal(second.stats.success, 1);
    assert.equal(h.calls.minus.length, 1);
    assert.equal(
      h.row.ipos_sync_status,
      "synced"
    );
  }
);

test(
  "Redis lock release uses ownership token",
  async () => {
    const h = createHarness({
      logResults: [found],
    });

    await h.worker
      .processCingGameGiftIposSyncQueue();

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
