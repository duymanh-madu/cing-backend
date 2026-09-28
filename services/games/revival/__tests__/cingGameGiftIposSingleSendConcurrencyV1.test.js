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

/*
 * Load the ACTUAL firstAttempt function.
 *
 * Only Supabase and time are replaced by an
 * isolated in-memory transactional simulator.
 */

const START =
  "async function firstAttempt(row) {";

const END =
  "async function markSynced(row) {";

assert.equal(
  SOURCE.split(START).length - 1,
  1
);

assert.equal(
  SOURCE.split(END).length - 1,
  1
);

const start =
  SOURCE.indexOf(START);

const end =
  SOURCE.indexOf(
    END,
    start
  );

assert.ok(end > start);

const actualFunction =
  SOURCE.slice(start, end);

/*
 * The SQL RPC owns the single-send CAS.
 * Worker validates and forwards the RPC result.
 */
assert.match(
  actualFunction,
  /cing_game_gift_ipos_first_attempt_v1/
);

assert.match(
  actualFunction,
  /typeof data\.send_allowed !== "boolean"/
);

assert.match(
  actualFunction,
  /sendAllowed:\s*data\.send_allowed/
);

assert.doesNotMatch(
  actualFunction,
  /\.update\s*\(/
);

function createSharedDatabase({
  firstAttemptAt = null,
  status = "processing",
} = {}) {
  const row = {
    id:
      "11111111-1111-4111-8111-111111111111",

    ipos_sync_status:
      status,

    ipos_locked_until:
      "2026-09-26T10:10:00.000Z",

    ipos_first_attempt_at:
      firstAttemptAt,

    updated_at:
      "2026-09-26T00:00:00.000Z",
  };

  const stats = {
    casWinners: 0,
    casMisses: 0,
    reads: 0,
  };

  const supabase = {
    from() {
      throw new Error(
        "direct_gift_table_access_forbidden"
      );
    },

    async rpc(name, args) {
      assert.equal(
        name,
        "cing_game_gift_ipos_first_attempt_v1"
      );

      /*
       * Yield so independently loaded worker
       * functions contend for the same state.
       * Check and mutation below are atomic.
       */
      await Promise.resolve();

      const eligible =
        row.id === args.p_purchase_id &&
        row.ipos_sync_status ===
          "processing" &&
        row.ipos_locked_until ===
          args.p_locked_until;

      if (!eligible) {
        stats.casMisses += 1;

        return {
          data: null,

          error: {
            message:
              "game_gift_first_attempt_lease_lost",
          },
        };
      }

      if (row.ipos_first_attempt_at) {
        stats.casMisses += 1;
        stats.reads += 1;

        return {
          data: {
            row: { ...row },
            send_allowed: false,
          },

          error: null,
        };
      }

      row.ipos_first_attempt_at =
        "2026-09-26T10:00:00.000Z";

      stats.casWinners += 1;

      return {
        data: {
          row: { ...row },
          send_allowed: true,
        },

        error: null,
      };
    },
  };

  return {
    row,
    stats,
    supabase,
  };
}

function createIndependentWorker(
  shared,
  timestamp
) {
  const sandbox = {
    supabase:
      shared.supabase,

    TABLE:
      "cing_game_gift_purchases",

    nowIso() {
      return timestamp;
    },

    Error,
  };

  vm.createContext(
    sandbox
  );

  vm.runInContext(
    actualFunction,
    sandbox
  );

  return sandbox.firstAttempt;
}

function claimedRow(shared) {
  return {
    ...shared.row,
  };
}

test(
  "two independent workers obtain exactly one send right",
  async () => {
    const shared =
      createSharedDatabase();

    const workerA =
      createIndependentWorker(
        shared,
        "2026-09-26T10:00:00.000Z"
      );

    const workerB =
      createIndependentWorker(
        shared,
        "2026-09-26T10:00:01.000Z"
      );

    const inputA =
      claimedRow(shared);

    const inputB =
      claimedRow(shared);

    const [
      resultA,
      resultB,
    ] = await Promise.all([
      workerA(inputA),
      workerB(inputB),
    ]);

    const allowed = [
      resultA.sendAllowed,
      resultB.sendAllowed,
    ];

    assert.equal(
      allowed.filter(Boolean).length,
      1
    );

    assert.equal(
      shared.stats.casWinners,
      1
    );

    assert.equal(
      shared.stats.casMisses,
      1
    );

    assert.equal(
      shared.stats.reads,
      1
    );

    assert.ok(
      shared.row.ipos_first_attempt_at
    );
  }
);

test(
  "already attempted purchase grants no further send right",
  async () => {
    const timestamp =
      "2026-09-26T09:00:00.000Z";

    const shared =
      createSharedDatabase({
        firstAttemptAt:
          timestamp,
      });

    const workerA =
      createIndependentWorker(
        shared,
        "2026-09-26T10:00:00.000Z"
      );

    const workerB =
      createIndependentWorker(
        shared,
        "2026-09-26T10:00:01.000Z"
      );

    const results =
      await Promise.all([
        workerA(
          claimedRow(shared)
        ),

        workerB(
          claimedRow(shared)
        ),
      ]);

    assert.deepEqual(
      results.map(
        result =>
          result.sendAllowed
      ),
      [
        false,
        false,
      ]
    );

    assert.equal(
      shared.stats.casWinners,
      0
    );

    assert.equal(
      shared.row.ipos_first_attempt_at,
      timestamp
    );
  }
);

test(
  "unconfirmed first-attempt ownership fails closed",
  async () => {
    const shared =
      createSharedDatabase({
        status: "pending",
      });

    const worker =
      createIndependentWorker(
        shared,
        "2026-09-26T10:00:00.000Z"
      );

    await assert.rejects(
      worker(
        claimedRow(shared)
      ),

      /game_gift_first_attempt_lease_lost/
    );

    assert.equal(
      shared.stats.casWinners,
      0
    );

    assert.equal(
      shared.row.ipos_first_attempt_at,
      null
    );
  }
);
