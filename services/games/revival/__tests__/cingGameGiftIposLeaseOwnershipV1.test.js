"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const vm =
  require("node:vm");

const SOURCE = fs.readFileSync(
  path.resolve(
    __dirname,
    "../cingGameGiftIposSyncWorker.js"
  ),
  "utf8"
);

function extract(start, end) {
  const a = SOURCE.indexOf(start);
  const b = SOURCE.indexOf(end, a);

  assert.ok(a >= 0, start);
  assert.ok(b > a, end);

  return SOURCE.slice(a, b);
}

const ACTUAL_FIRST_ATTEMPT =
  extract(
    "async function firstAttempt(row) {",
    "async function markSynced(row) {"
  );

const ACTUAL_MARK_SYNCED =
  extract(
    "async function markSynced(row) {",
    "async function markFailed("
  );

const ACTUAL_MARK_FAILED =
  extract(
    "async function markFailed(",
    "async function\nprocessCingGameGiftIposSyncQueue("
  );

const OLD_LEASE =
  "2026-09-26T10:10:00.000Z";

const NEW_LEASE =
  "2026-09-26T10:20:01.000Z";

function createDatabase() {
  const state = {
    id:
      "11111111-1111-4111-8111-111111111111",

    ipos_sync_status:
      "processing",

    ipos_first_attempt_at:
      null,

    ipos_retry_count:
      0,

    ipos_locked_until:
      OLD_LEASE,

    ipos_synced_at:
      null,
  };

  const calls = [];

  const supabase = {
    from() {
      throw new Error(
        "direct_gift_table_access_forbidden"
      );
    },

    async rpc(name, args) {
      /*
       * Yield before checking the current
       * lease, simulating the database boundary.
       */
      await Promise.resolve();

      const eligible =
        state.id === args.p_purchase_id &&
        state.ipos_sync_status ===
          "processing" &&
        state.ipos_locked_until ===
          args.p_locked_until;

      const failure = message => ({
        data: null,
        error: { message },
      });

      if (
        name ===
        "cing_game_gift_ipos_first_attempt_v1"
      ) {
        if (!eligible) {
          return failure(
            "game_gift_first_attempt_lease_lost"
          );
        }

        const sendAllowed =
          state.ipos_first_attempt_at === null;

        if (sendAllowed) {
          state.ipos_first_attempt_at =
            "2026-09-26T10:01:00.000Z";
        }

        calls.push({
          rpc: name,
          sendAllowed,
        });

        return {
          data: {
            row: { ...state },
            send_allowed: sendAllowed,
          },
          error: null,
        };
      }

      if (
        name ===
        "cing_game_gift_ipos_mark_synced_v1"
      ) {
        if (!eligible) {
          return failure(
            "game_gift_mark_synced_failed"
          );
        }

        state.ipos_sync_status =
          "synced";

        state.ipos_synced_at =
          "2026-09-26T10:02:00.000Z";

        state.ipos_locked_until = null;

        calls.push({
          rpc: name,
        });

        return {
          data: true,
          error: null,
        };
      }

      if (
        name ===
        "cing_game_gift_ipos_mark_failed_v1"
      ) {
        if (!eligible) {
          return failure(
            "game_gift_mark_failed_lease_lost"
          );
        }

        state.ipos_retry_count += 1;

        const terminal =
          state.ipos_retry_count >= 6;

        state.ipos_sync_status =
          terminal ? "failed" : "pending";

        state.ipos_locked_until = null;

        calls.push({
          rpc: name,
        });

        return {
          data: {
            retry_count:
              state.ipos_retry_count,

            terminal,

            status:
              state.ipos_sync_status,

            next_retry_at:
              "2026-09-26T10:12:00.000Z",
          },

          error: null,
        };
      }

      throw new Error(
        "unexpected_gift_rpc:" + name
      );
    },
  };

  return {
    state,
    calls,
    supabase,
  };
}

function createWorker(shared) {
  const sandbox = {
    supabase:
      shared.supabase,

    TABLE:
      "cing_game_gift_purchases",

    MAX_RETRIES:
      6,

    nowIso() {
      return "2026-09-26T10:11:00.000Z";
    },

    nextRetryIso() {
      return "2026-09-26T10:12:00.000Z";
    },

    async sendAdminAlert() {
      throw new Error(
        "Unexpected alert"
      );
    },

    Error,
    Number,
    String,
  };

  vm.createContext(sandbox);

  vm.runInContext(
    ACTUAL_FIRST_ATTEMPT
    + "\n"
    + ACTUAL_MARK_SYNCED
    + "\n"
    + ACTUAL_MARK_FAILED,
    sandbox
  );

  return sandbox;
}

test(
  "stale worker cannot acquire first send right after reclaim",
  async () => {
    const shared =
      createDatabase();

    const worker =
      createWorker(shared);

    const staleRow = {
      ...shared.state,
    };

    shared.state.ipos_locked_until =
      NEW_LEASE;

    await assert.rejects(
      worker.firstAttempt(
        staleRow
      ),

      /game_gift_first_attempt_lease_lost/
    );

    assert.equal(
      shared.state.ipos_first_attempt_at,
      null
    );
  }
);

test(
  "stale worker cannot mark replacement worker synced",
  async () => {
    const shared =
      createDatabase();

    const worker =
      createWorker(shared);

    const staleRow = {
      ...shared.state,
    };

    shared.state.ipos_locked_until =
      NEW_LEASE;

    await assert.rejects(
      worker.markSynced(
        staleRow
      ),

      /game_gift_mark_synced_failed/
    );

    assert.equal(
      shared.state.ipos_sync_status,
      "processing"
    );

    assert.equal(
      shared.state.ipos_synced_at,
      null
    );
  }
);

test(
  "stale worker cannot reset replacement worker pending",
  async () => {
    const shared =
      createDatabase();

    const worker =
      createWorker(shared);

    const staleRow = {
      ...shared.state,
    };

    shared.state.ipos_locked_until =
      NEW_LEASE;

    await assert.rejects(
      worker.markFailed(
        staleRow,
        "old worker timeout"
      ),

      /game_gift_mark_failed_failed/
    );

    assert.equal(
      shared.state.ipos_sync_status,
      "processing"
    );

    assert.equal(
      shared.state.ipos_retry_count,
      0
    );
  }
);

test(
  "current lease owner can reconcile successfully",
  async () => {
    const shared =
      createDatabase();

    const worker =
      createWorker(shared);

    const row = {
      ...shared.state,
    };

    await worker.markSynced(
      row
    );

    assert.equal(
      shared.state.ipos_sync_status,
      "synced"
    );

    assert.ok(
      shared.state.ipos_synced_at
    );
  }
);

test(
  "current lease owner can record failed attempt",
  async () => {
    const shared =
      createDatabase();

    const worker =
      createWorker(shared);

    const row = {
      ...shared.state,
    };

    await worker.markFailed(
      row,
      "offline-test-error"
    );

    assert.equal(
      shared.state.ipos_sync_status,
      "pending"
    );

    assert.equal(
      shared.state.ipos_retry_count,
      1
    );
  }
);
