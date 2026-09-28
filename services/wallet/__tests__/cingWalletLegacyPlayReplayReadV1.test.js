"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

/*
 * The production Wallet normalizers import the existing
 * Wallet service, which imports supabase.js at module load.
 *
 * This test supplies its own injected database. Prevent
 * module initialization from requiring live credentials.
 *
 * Only the test process sees this temporary module stub.
 */
const supabasePath = require.resolve(
  "../../../supabase"
);

const previousSupabaseCache =
  require.cache[supabasePath];

let readCommittedWalletPlayPurchase;

try {
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {},
  };

  ({
    readCommittedWalletPlayPurchase,
  } = require(
    "../cingWalletLegacyPlayReplayReadService"
  ));
} finally {
  if (previousSupabaseCache) {
    require.cache[supabasePath] =
      previousSupabaseCache;
  } else {
    delete require.cache[supabasePath];
  }
}

const USER = "0912345678";

const REQUEST =
  "123e4567-e89b-42d3-a456-426614174000";

const WALLET_ID =
  "123e4567-e89b-42d3-a456-426614174001";

const KEY =
  "wallet_play_purchase:user:"
  + USER
  + ":request:"
  + REQUEST;

function walletRow(overrides = {}) {
  return {
    id: WALLET_ID,
    user_id: USER,
    transaction_type: "payment",
    amount: -2000,
    balance_after: 8000,
    idempotency_key: KEY,
    reference_type: "game_play_purchase",
    reference_id: REQUEST,
    metadata: {
      quantity: 2,
      unit_price: 1000,
      total_cost: 2000,
    },
    ...overrides,
  };
}

function ledgerRow(overrides = {}) {
  return {
    user_id: USER,
    transaction_type: "add",
    amount: 2,
    balance_after: 12,
    reference_type: "wallet_play_purchase",
    reference_id: WALLET_ID,
    ...overrides,
  };
}

function makeDatabase({
  wallet = walletRow(),
  ledger = ledgerRow(),
  walletError = null,
  ledgerError = null,
} = {}) {
  const calls = [];

  const db = {
    from(table) {
      const call = {
        table,
        filters: [],
      };

      calls.push(call);

      const query = {
        select(columns) {
          call.columns = columns;
          return query;
        },

        eq(column, value) {
          call.filters.push([
            column,
            value,
          ]);
          return query;
        },

        async maybeSingle() {
          if (
            table ===
            "cing_wallet_transactions"
          ) {
            return {
              data: wallet,
              error: walletError,
            };
          }

          if (
            table ===
            "game_play_transactions"
          ) {
            return {
              data: ledger,
              error: ledgerError,
            };
          }

          throw new Error(
            "UNEXPECTED_DATABASE_TABLE"
          );
        },
      };

      return query;
    },
  };

  return {
    db,
    calls,
  };
}

function read(db, overrides = {}) {
  return readCommittedWalletPlayPurchase({
    customer: {
      phone: USER,
    },
    quantity: 2,
    requestId: REQUEST,
    db,
    ...overrides,
  });
}

test(
  "committed replay returns exact historical snapshot",
  async () => {
    const { db, calls } =
      makeDatabase();

    const result = await read(db);

    assert.equal(
      result.applied,
      false
    );

    assert.equal(
      result.wallet_transaction_id,
      WALLET_ID
    );

    assert.equal(
      result.quantity,
      2
    );

    assert.equal(
      result.unit_price,
      1000
    );

    assert.equal(
      result.total_cost,
      2000
    );

    assert.equal(
      result.wallet_balance_after,
      8000
    );

    assert.equal(
      result.game_plays_after,
      12
    );

    assert.deepEqual(
      calls.map(x => x.table),
      [
        "cing_wallet_transactions",
        "game_play_transactions",
      ]
    );

    assert.deepEqual(
      calls[0].filters,
      [
        [
          "idempotency_key",
          KEY,
        ],
      ]
    );

    assert.deepEqual(
      calls[1].filters,
      [
        [
          "reference_type",
          "wallet_play_purchase",
        ],
        [
          "reference_id",
          WALLET_ID,
        ],
      ]
    );
  }
);

test(
  "unknown request returns null without ledger lookup",
  async () => {
    const { db, calls } =
      makeDatabase({
        wallet: null,
      });

    assert.equal(
      await read(db),
      null
    );

    assert.equal(
      calls.length,
      1
    );
  }
);

test(
  "quantity mismatch fails closed",
  async () => {
    const { db, calls } =
      makeDatabase();

    await assert.rejects(
      read(
        db,
        { quantity: 3 }
      ),
      {
        code:
          "CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT",
      }
    );

    assert.equal(
      calls.length,
      1
    );
  }
);

test(
  "wallet ownership mismatch fails closed",
  async () => {
    const { db } =
      makeDatabase({
        wallet: walletRow({
          user_id:
            "0999999999",
        }),
      });

    await assert.rejects(
      read(db),
      {
        code:
          "CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT",
      }
    );
  }
);

test(
  "wallet read failure is not treated as not found",
  async () => {
    const { db } =
      makeDatabase({
        walletError: {
          message:
            "read unavailable",
        },
      });

    await assert.rejects(
      read(db),
      {
        code:
          "CING_WALLET_PLAY_REPLAY_READ_FAILED",
      }
    );
  }
);

test(
  "missing ledger fails closed",
  async () => {
    const { db } =
      makeDatabase({
        ledger: null,
      });

    await assert.rejects(
      read(db),
      {
        code:
          "CING_WALLET_PLAY_PURCHASE_LEDGER_MISSING",
      }
    );
  }
);

test(
  "ledger mismatch fails closed",
  async () => {
    const { db } =
      makeDatabase({
        ledger: ledgerRow({
          amount: 3,
        }),
      });

    await assert.rejects(
      read(db),
      {
        code:
          "CING_WALLET_PLAY_PURCHASE_LEDGER_CONFLICT",
      }
    );
  }
);

test(
  "ledger read failure fails closed",
  async () => {
    const { db } =
      makeDatabase({
        ledgerError: {
          message:
            "read unavailable",
        },
      });

    await assert.rejects(
      read(db),
      {
        code:
          "CING_WALLET_PLAY_REPLAY_LEDGER_READ_FAILED",
      }
    );
  }
);

test(
  "unsafe price snapshot is rejected",
  async () => {
    const { db } =
      makeDatabase({
        wallet: walletRow({
          metadata: {
            quantity: 2,
            unit_price:
              "9007199254740993",
            total_cost:
              "18014398509481986",
          },
        }),
      });

    await assert.rejects(
      read(db),
      {
        code:
          "CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT",
      }
    );
  }
);

test(
  "invalid request ID is rejected before reading DB",
  async () => {
    const { db, calls } =
      makeDatabase();

    await assert.rejects(
      read(
        db,
        {
          requestId:
            "invalid-request-id",
        }
      ),
      {
        code:
          "CING_WALLET_PLAY_PURCHASE_REQUEST_ID_INVALID",
      }
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "reader contains no mutation method or RPC call",
  () => {
    const fs =
      require("node:fs");

    const path =
      require("node:path");

    const source =
      fs.readFileSync(
        path.join(
          __dirname,
          "../cingWalletLegacyPlayReplayReadService.js"
        ),
        "utf8"
      );

    for (const forbidden of [
      ".rpc(",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        forbidden
      );
    }
  }
);
